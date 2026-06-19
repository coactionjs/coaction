import { vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('use-sync-external-store/shim');
  vi.doUnmock('coaction');
  vi.resetModules();
});

test('uses getInitialState as fallback snapshot for selector and multi-selector', async () => {
  vi.resetModules();
  const useSyncExternalStore = vi.fn(
    (
      _subscribe: () => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown
    ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
  );
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore
  }));

  const { create, createSelector } = await import('../src');
  const useCounter = create(() => ({
    count: 1
  }));
  const useStep = create(() => ({
    step: 2
  }));

  const selected = useCounter((state) => state.count);
  const plain = useCounter();
  const selectTotal = createSelector(useCounter, useStep);
  const total = selectTotal((counter, step) => counter.count + step.step);

  expect(selected).toBe(1);
  expect(plain.count).toBe(1);
  expect(total).toBe(3);
  expect(useSyncExternalStore).toHaveBeenCalledTimes(3);
  expect(typeof useSyncExternalStore.mock.calls[0][2]).toBe('function');
  expect(typeof useSyncExternalStore.mock.calls[1][2]).toBe('function');
  expect(typeof useSyncExternalStore.mock.calls[2][2]).toBe('function');
});

test('autoSelector in slices mode ignores non-object slice values', async () => {
  vi.resetModules();
  const useSyncExternalStore = vi.fn(
    (
      _subscribe: () => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown
    ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
  );
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore
  }));
  const { create } = await import('../src');
  const protoKey = '__coactionReactNonObjectSlice__';
  Object.defineProperty(Object.prototype, protoKey, {
    value: 1,
    enumerable: true,
    configurable: true,
    writable: true
  });
  try {
    const store = create(
      {
        counter: () => ({
          count: 0
        })
      },
      {
        sliceMode: 'slices'
      }
    );
    const selectors = store.auto() as any;
    expect(selectors.counter).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(selectors, protoKey)
    ).toBeFalsy();
    expect(useSyncExternalStore).not.toHaveBeenCalled();
  } finally {
    delete (Object.prototype as any)[protoKey];
  }
});

test('autoSelector option returns cached selector map without subscribing', async () => {
  vi.resetModules();
  const useSyncExternalStore = vi.fn(
    (
      _subscribe: () => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown
    ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
  );
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore
  }));

  const { create } = await import('../src');
  const store = create(() => ({
    count: 0,
    nested: {
      value: 1
    }
  }));

  const fromMethod = store.auto();
  const fromOption = store({
    autoSelector: true
  });

  expect(fromOption).toBe(fromMethod);
  expect(typeof fromMethod.count).toBe('function');
  expect(typeof fromMethod.nested).toBe('function');
  expect(typeof fromMethod.nested.value).toBe('function');
  expect(useSyncExternalStore).not.toHaveBeenCalled();
});

test('autoSelector stops expanding recursive references', async () => {
  vi.resetModules();
  const useSyncExternalStore = vi.fn(
    (
      _subscribe: () => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown
    ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
  );
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore
  }));

  const { create } = await import('../src');
  const nested = {
    value: 1
  } as {
    self?: unknown;
    value: number;
  };
  nested.self = nested;

  const store = create(() => ({
    nested
  }));

  const selectors = store.auto() as any;
  expect(typeof selectors.nested).toBe('function');
  expect(typeof selectors.nested.value).toBe('function');
  expect(typeof selectors.nested.self).toBe('function');
  expect(selectors.nested.self.self).toBeUndefined();
  expect(useSyncExternalStore).not.toHaveBeenCalled();
});

test('observer disposes uncommitted render tracker after grace period', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const dispose = vi.fn();
  const tracker = {
    dispose,
    getSnapshot: () => 0,
    subscribe: vi.fn(() => () => undefined),
    track: (fn: () => unknown) => fn()
  };
  vi.doMock('coaction', async () => ({
    ...(await vi.importActual<object>('coaction')),
    createReactiveTracker: () => tracker
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        _subscribe: () => () => void,
        getSnapshot: () => unknown,
        _getServerSnapshot?: () => unknown
      ) => getSnapshot()
    )
  }));

  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { observer } = await import('../src');
  const Counter = observer(() => React.createElement('span', null, 'count'));

  render(React.createElement(Counter) as any);
  expect(dispose).not.toHaveBeenCalled();
  expect(tracker.subscribe).not.toHaveBeenCalled();

  vi.advanceTimersByTime(9_999);
  expect(dispose).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('observer committed subscription cancels uncommitted tracker cleanup', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const dispose = vi.fn();
  const tracker = {
    dispose,
    getSnapshot: () => 0,
    subscribe: vi.fn(() => () => undefined),
    track: (fn: () => unknown) => fn()
  };
  vi.doMock('coaction', async () => ({
    ...(await vi.importActual<object>('coaction')),
    createReactiveTracker: () => tracker
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
        _getServerSnapshot?: () => unknown
      ) => {
        subscribe(() => undefined);
        return getSnapshot();
      }
    )
  }));

  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { observer } = await import('../src');
  const Counter = observer(() => React.createElement('span', null, 'count'));

  render(React.createElement(Counter) as any);
  expect(tracker.subscribe).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(10_000);
  expect(dispose).not.toHaveBeenCalled();
});

test('observer disposes tracker after committed subscription is released', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  let unsubscribe: (() => void) | undefined;
  const dispose = vi.fn();
  const tracker = {
    dispose,
    getSnapshot: () => 0,
    subscribe: vi.fn(() => () => undefined),
    track: (fn: () => unknown) => fn()
  };
  vi.doMock('coaction', async () => ({
    ...(await vi.importActual<object>('coaction')),
    createReactiveTracker: () => tracker
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
        _getServerSnapshot?: () => unknown
      ) => {
        unsubscribe = subscribe(() => undefined);
        return getSnapshot();
      }
    )
  }));

  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { observer } = await import('../src');
  const Counter = observer(() => React.createElement('span', null, 'count'));

  render(React.createElement(Counter) as any);
  expect(tracker.subscribe).toHaveBeenCalledTimes(1);

  unsubscribe?.();
  vi.advanceTimersByTime(9_999);
  expect(dispose).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('observer syncs active tracker snapshot when resubscribing after missed update', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  let trackerSnapshot = 0;
  let unsubscribe: (() => void) | undefined;
  let subscribeFromHook!: (listener: () => void) => () => void;
  let getSnapshotFromHook!: () => unknown;
  const initialListener = vi.fn();
  const dispose = vi.fn();
  const trackerListeners = new Set<() => void>();
  const tracker = {
    dispose,
    getSnapshot: () => trackerSnapshot,
    subscribe: vi.fn((listener: () => void) => {
      trackerListeners.add(listener);
      return () => {
        trackerListeners.delete(listener);
      };
    }),
    track: (fn: () => unknown) => fn()
  };
  vi.doMock('coaction', async () => ({
    ...(await vi.importActual<object>('coaction')),
    createReactiveTracker: () => tracker
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
        _getServerSnapshot?: () => unknown
      ) => {
        subscribeFromHook = subscribe;
        getSnapshotFromHook = getSnapshot;
        unsubscribe ??= subscribe(initialListener);
        return getSnapshot();
      }
    )
  }));

  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { observer } = await import('../src');
  const Counter = observer(() => React.createElement('span', null, 'count'));

  render(React.createElement(Counter) as any);
  expect(tracker.subscribe).toHaveBeenCalledTimes(1);
  expect(trackerListeners.size).toBe(1);
  expect(getSnapshotFromHook()).toBe(0);

  unsubscribe?.();
  expect(trackerListeners.size).toBe(0);

  trackerSnapshot = 1;
  const resubscribeListener = vi.fn();
  const unsubscribeAgain = subscribeFromHook(resubscribeListener);

  expect(tracker.subscribe).toHaveBeenCalledTimes(2);
  expect(resubscribeListener).toHaveBeenCalledTimes(1);
  expect(getSnapshotFromHook()).toBe(1);

  unsubscribeAgain();
});

test('handles non-object slice state defensively', async () => {
  vi.resetModules();
  const mockStore = {
    isSliceStore: true,
    subscribe: () => () => undefined,
    getState: () => null,
    getPureState: () => null,
    getInitialState: () => null
  };
  vi.doMock('coaction', () => ({
    create: () => mockStore,
    createReactiveTracker: () => ({
      dispose: () => undefined,
      getSnapshot: () => 0,
      subscribe: () => () => undefined,
      track: (fn: () => unknown) => fn()
    }),
    wrapStore: (store: object, selectorHook: (selector: any) => unknown) =>
      Object.assign((selector?: unknown) => selectorHook(selector), store)
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        _subscribe: () => () => void,
        getSnapshot: () => unknown,
        getServerSnapshot?: () => unknown
      ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
    )
  }));
  const { create } = await import('../src');
  const store = create(() => ({}));
  expect(store.auto()).toMatchInlineSnapshot(`{}`);
});
