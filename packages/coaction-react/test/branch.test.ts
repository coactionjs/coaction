import { expectTypeOf, vi } from 'vitest';
import type { AutoSelectors } from '../src';

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('use-sync-external-store/shim');
  vi.doUnmock('coaction');
  vi.doUnmock('coaction/adapter');
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

  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { create, createSelector } = await import('../src');
  const useCounter = create(() => ({
    count: 1
  }));
  const useStep = create(() => ({
    step: 2
  }));
  const selectTotal = createSelector(useCounter, useStep);

  let selected: unknown;
  let plain: { count: number } | undefined;
  let total: unknown;
  // The store hooks hold per-component tracker state, so they have to run
  // under a renderer rather than as bare calls.
  const Probe = () => {
    selected = useCounter((state) => state.count);
    plain = useCounter();
    total = selectTotal((counter, step) => counter.count + step.step);
    return null;
  };
  render(React.createElement(Probe) as any);

  expect(selected).toBe(1);
  expect(plain!.count).toBe(1);
  expect(total).toBe(3);
  expect(useSyncExternalStore).toHaveBeenCalledTimes(3);
  expect(typeof useSyncExternalStore.mock.calls[0][2]).toBe('function');
  expect(typeof useSyncExternalStore.mock.calls[1][2]).toBe('function');
  expect(typeof useSyncExternalStore.mock.calls[2][2]).toBe('function');
});

test('multi-store selector detects updates before subscription commits', async () => {
  vi.resetModules();
  const storeRef: { useCounter?: any } = {};
  let didUpdateBeforeSubscribe = false;
  // Delegate to the real hook, but land a store update in the window between
  // the render-phase read and the subscription React establishes in an effect.
  // The selector has to converge on the newer value rather than keep the
  // total it rendered before the update.
  vi.doMock('use-sync-external-store/shim', async () => {
    const { useSyncExternalStore } = await import('react');
    return {
      useSyncExternalStore: (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
        getServerSnapshot?: () => unknown
      ) => {
        if (!didUpdateBeforeSubscribe) {
          didUpdateBeforeSubscribe = true;
          storeRef.useCounter!.getState().increment();
        }
        return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      }
    };
  });

  const React = await import('react');
  const { render, screen } = await import('@testing-library/react');
  const { create, createSelector } = await import('../src');
  storeRef.useCounter = create((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const useStep = create(() => ({
    step: 2
  }));
  const selectTotal = createSelector(storeRef.useCounter, useStep);

  const Total = () => {
    const total = selectTotal((counter, step) => counter.count + step.step);
    return React.createElement('span', { 'data-testid': 'total' }, total);
  };
  render(React.createElement(Total) as any);

  expect(didUpdateBeforeSubscribe).toBe(true);
  expect(storeRef.useCounter.getState().count).toBe(1);
  expect(screen.getByTestId('total').textContent).toBe('3');
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

test('autoSelector includes symbol keyed state and slices', async () => {
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
  const valueKey = Symbol('react-value');
  const sliceKey = Symbol('react-slice');
  const store = create(() => ({
    [valueKey]: 1,
    count: 0
  })) as any;
  const sliceStore = create(
    {
      [sliceKey]: () => ({
        count: 2
      })
    } as any,
    {
      sliceMode: 'slices'
    }
  ) as any;

  const selectors = store.auto();
  const sliceSelectors = sliceStore.auto();

  expect(Object.getOwnPropertySymbols(selectors)).toContain(valueKey);
  expect(selectors[valueKey](store.getState())).toBe(1);
  expect(Object.getOwnPropertySymbols(sliceSelectors)).toContain(sliceKey);
  expect(sliceSelectors[sliceKey].count(sliceStore.getState())).toBe(2);
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

test('autoSelector treats non-plain object values as leaf selectors', async () => {
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

  class Box {
    value: number;

    constructor(value: number) {
      this.value = value;
    }
  }

  const { create } = await import('../src');
  const box = new Box(1);
  const store = create(() => ({
    box
  }));

  const selectors = store.auto() as any;
  expect(typeof selectors.box).toBe('function');
  expect(selectors.box(store.getState())).toBe(box);
  expect(selectors.box.value).toBeUndefined();
  expect(useSyncExternalStore).not.toHaveBeenCalled();
});

test('autoSelector types non-plain object values as leaf selectors', () => {
  type State = {
    stamp: Date;
    nested: {
      stamp: Date;
    };
  };

  expectTypeOf<AutoSelectors<State>['stamp']>().toEqualTypeOf<
    (state: State) => Date
  >();
  expectTypeOf<AutoSelectors<State>['nested']['stamp']>().toEqualTypeOf<
    (state: State) => Date
  >();
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
  vi.doMock('coaction/adapter', async () => ({
    ...(await vi.importActual<object>('coaction/adapter')),
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

test('uncommitted renders share one cleanup timer and keep their own deadlines', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const dispose = vi.fn();
  vi.doMock('coaction/adapter', async () => ({
    ...(await vi.importActual<object>('coaction/adapter')),
    createReactiveTracker: () => ({
      dispose,
      getSnapshot: () => 0,
      subscribe: vi.fn(() => () => undefined),
      track: (fn: () => unknown) => fn()
    })
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
  const Item = observer(() => React.createElement('span', null, 'item'));

  const timersBefore = vi.getTimerCount();
  render(React.createElement(Item) as any);
  render(React.createElement(Item) as any);
  expect(vi.getTimerCount() - timersBefore).toBe(1);

  vi.advanceTimersByTime(5_000);
  render(React.createElement(Item) as any);
  expect(vi.getTimerCount() - timersBefore).toBe(1);

  vi.advanceTimersByTime(5_000);
  expect(dispose).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(4_999);
  expect(dispose).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1);
  expect(dispose).toHaveBeenCalledTimes(3);
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
  vi.doMock('coaction/adapter', async () => ({
    ...(await vi.importActual<object>('coaction/adapter')),
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
  vi.doMock('coaction/adapter', async () => ({
    ...(await vi.importActual<object>('coaction/adapter')),
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

  // Losing the last subscriber means the component is gone, so the tracker is
  // released on the next macrotask rather than held for the uncommitted-render
  // window -- while it lives, every store write keeps paying for patches.
  unsubscribe?.();
  expect(dispose).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('observer resubscribing before the release timer keeps its tracker', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  let unsubscribe: (() => void) | undefined;
  let subscribeFromHook!: (listener: () => void) => () => void;
  const dispose = vi.fn();
  const tracker = {
    dispose,
    getSnapshot: () => 0,
    subscribe: vi.fn(() => () => undefined),
    track: (fn: () => unknown) => fn()
  };
  vi.doMock('coaction/adapter', async () => ({
    ...(await vi.importActual<object>('coaction/adapter')),
    createReactiveTracker: () => tracker
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown
      ) => {
        subscribeFromHook = subscribe;
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

  // A StrictMode replay or a remounted Offscreen subtree unsubscribes and
  // resubscribes synchronously, which has to cancel the pending release.
  unsubscribe?.();
  subscribeFromHook(() => undefined);
  vi.advanceTimersByTime(1);
  expect(dispose).not.toHaveBeenCalled();
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
  vi.doMock('coaction/adapter', async () => ({
    ...(await vi.importActual<object>('coaction/adapter')),
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
    create: () => mockStore
  }));
  vi.doMock('coaction/adapter', () => ({
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

test('re-renders re-track two trackers instead of creating one per render', async () => {
  vi.resetModules();
  let created = 0;
  vi.doMock('coaction/adapter', async () => {
    const actual =
      await vi.importActual<typeof import('coaction/adapter')>(
        'coaction/adapter'
      );
    return {
      ...actual,
      createReactiveTracker: () => {
        created += 1;
        return actual.createReactiveTracker();
      }
    };
  });
  const React = await import('react');
  const { act, render, screen } = await import('@testing-library/react');
  const { create, observer } = await import('../src');
  const useStore = create((set: any) => ({
    count: 0,
    increment() {
      set(() => {
        (this as { count: number }).count += 1;
      });
    }
  })) as any;
  const Count = observer(() =>
    React.createElement('span', { 'data-testid': 'observed' }, useStore().count)
  );
  const Selected = () =>
    React.createElement(
      'span',
      { 'data-testid': 'selected' },
      useStore((state: { count: number }) => state.count)
    );
  render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Count),
      React.createElement(Selected)
    ) as any
  );
  for (let index = 0; index < 5; index += 1) {
    act(() => useStore.getState().increment());
  }
  expect(screen.getByTestId('observed').textContent).toBe('5');
  expect(screen.getByTestId('selected').textContent).toBe('5');
  // One committed and one spare tracker per hook, however many renders.
  expect(created).toBeLessThanOrEqual(4);
  useStore.destroy();
});

test('a re-tracked observer keeps dependencies it reads in another order', async () => {
  vi.resetModules();
  const React = await import('react');
  const { act, render, screen } = await import('@testing-library/react');
  const { create, observer } = await import('../src');
  const useStore = create((set: any) => ({
    a: 'a',
    b: 'b',
    c: 'c',
    setB(value: string) {
      set(() => {
        (this as { b: string }).b = value;
      });
    }
  })) as any;
  const Pair = observer(({ mode }: { mode: number }) => {
    const state = useStore();
    const text =
      mode === 0
        ? `${state.a}${state.b}`
        : mode === 1
          ? state.c
          : `${state.b}${state.a}`;
    return React.createElement('span', { 'data-testid': 'pair' }, text);
  });
  let setMode!: (mode: number) => void;
  const Parent = () => {
    const [mode, update] = React.useState(0);
    setMode = update;
    return React.createElement(Pair, { mode });
  };
  render(React.createElement(Parent) as any);
  // No store write in between: the third render re-tracks the first
  // render's tracker, in the reverse order, within one alien-signals cycle.
  act(() => setMode(1));
  act(() => setMode(2));
  expect(screen.getByTestId('pair').textContent).toBe('ba');
  act(() => useStore.getState().setB('B'));
  expect(screen.getByTestId('pair').textContent).toBe('Ba');
  useStore.destroy();
});

test.each(['observer', 'selector'] as const)(
  'each uncommitted %s render restarts its tracker grace period',
  async (kind) => {
    vi.useFakeTimers();
    vi.resetModules();
    let disposed = 0;
    vi.doMock('coaction/adapter', async () => {
      const actual =
        await vi.importActual<typeof import('coaction/adapter')>(
          'coaction/adapter'
        );
      return {
        ...actual,
        createReactiveTracker: () => {
          const tracker = actual.createReactiveTracker();
          return {
            ...tracker,
            dispose: () => {
              disposed += 1;
              tracker.dispose();
            }
          };
        }
      };
    });
    const React = await import('react');
    const { act, render } = await import('@testing-library/react');
    const { create, observer } = await import('../src');
    const useStore = create(() => ({ count: 0 })) as any;
    let suspended: Promise<void> | undefined;
    const View =
      kind === 'observer'
        ? observer(({ value }: { value: number }) => {
            if (suspended) throw suspended;
            return React.createElement(
              'span',
              null,
              `${useStore().count}:${value}`
            );
          })
        : ({ value }: { value: number }) => {
            const count = useStore((state: { count: number }) => state.count);
            if (suspended) throw suspended;
            return React.createElement('span', null, `${count}:${value}`);
          };
    let setValue!: (value: number) => void;
    const Parent = () => {
      const [value, update] = React.useState(0);
      setValue = update;
      return React.createElement(
        React.Suspense,
        { fallback: 'loading' },
        React.createElement(View, { value })
      );
    };
    render(React.createElement(Parent) as any);
    suspended = new Promise<void>(() => undefined);
    // A transition keeps the committed UI while its render stays suspended.
    await act(async () => React.startTransition(() => setValue(1)));
    vi.advanceTimersByTime(9_000);
    // The next attempt re-tracks that render's tracker; its grace period has to
    // start over, or it is released under a render that may yet commit.
    await act(async () => React.startTransition(() => setValue(2)));
    vi.advanceTimersByTime(1_000);
    expect(disposed).toBe(0);
    vi.advanceTimersByTime(9_000);
    expect(disposed).toBe(1);
    useStore.destroy();
    vi.useRealTimers();
  }
);

test('an observer traverses a frozen wrapper of its own that it renders', async () => {
  vi.resetModules();
  const React = await import('react');
  const { act, render, screen } = await import('@testing-library/react');
  const { create, observer } = await import('../src');
  const useStore = create((set: any) => ({
    user: { name: 'Ada', age: 30 },
    grow() {
      set(() => {
        (this as { user: { age: number } }).user.age += 1;
      });
    }
  })) as any;
  const Age = ({ data }: { data: { user: { age: number } } }) =>
    React.createElement('span', { 'data-testid': 'age' }, data.user.age);
  // Reading the name traverses `user`; only the wrapper carries it whole.
  const Profile = observer(() => {
    const state = useStore();
    return React.createElement(
      'div',
      null,
      state.user.name,
      React.createElement(Age, { data: Object.freeze({ user: state.user }) })
    );
  });
  render(React.createElement(Profile) as any);
  expect(screen.getByTestId('age').textContent).toBe('30');
  act(() => useStore.getState().grow());
  expect(screen.getByTestId('age').textContent).toBe('31');
  useStore.destroy();
});
