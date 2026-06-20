import { vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('coaction');
  vi.doUnmock('mobx');
  vi.resetModules();
});

test('skips handleStore re-initialization when mutable mapper already exists', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    },
    onStoreReady: () => () => undefined,
    replaceExternalStoreState: vi.fn(),
    sanitizeInitialStateValue: (value: unknown) => value,
    sanitizeReplacementState: (value: unknown) => value
  }));
  await import('../src');
  const internal = {};
  const state = {
    count: 0
  };
  const store = {
    getState: () => state
  };
  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    internal as any
  );
  const applyRef = (store as any).apply;
  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    internal as any
  );
  expect((store as any).apply).toBe(applyRef);
});

test('destroy unsubscribes autorun only once', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  const cancelReadySubscription = vi.fn();
  const unsubscribe = vi.fn(() => {
    if (unsubscribe.mock.calls.length > 1) {
      throw new Error('unsubscribe called twice');
    }
  });
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    },
    onStoreReady: vi.fn((_store: unknown, callback: () => void) => {
      callback();
      return cancelReadySubscription;
    }),
    replaceExternalStoreState: vi.fn(),
    sanitizeInitialStateValue: (value: unknown) => value,
    sanitizeReplacementState: (value: unknown) => value
  }));
  vi.doMock('mobx', () => ({
    autorun: vi.fn((runner: () => void) => {
      runner();
      return unsubscribe;
    }),
    runInAction: (runner: () => void) => runner(),
    untracked: (runner: () => void) => runner()
  }));
  await import('../src');
  const state = {
    count: 0
  };
  const baseDestroy = vi.fn();
  const store = {
    share: false,
    getPureState: () => state,
    getState: () => state,
    destroy: baseDestroy
  };

  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    {
      notifyStateChange: vi.fn()
    } as any
  );

  (store as any).destroy();
  expect(() => (store as any).destroy()).not.toThrow();
  expect(cancelReadySubscription).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});

test('shared sync snapshots preserve sparse array shape', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  let autorunRunner: (() => void) | undefined;
  const replaceExternalStoreState = vi.fn();
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    },
    onStoreReady: vi.fn((_store: unknown, callback: () => void) => {
      callback();
      return vi.fn();
    }),
    replaceExternalStoreState,
    sanitizeInitialStateValue: (value: unknown) => value,
    sanitizeReplacementState: (value: unknown) => value
  }));
  vi.doMock('mobx', () => ({
    autorun: vi.fn((runner: () => void) => {
      autorunRunner = runner;
      runner();
      return vi.fn();
    }),
    runInAction: (runner: () => void) => runner(),
    untracked: (runner: () => void) => runner()
  }));
  await import('../src');
  const tag = Symbol('array-tag');
  const makeList = (label: string, includeUndefined: boolean) => {
    const list = [] as any[];
    list.length = 2;
    if (includeUndefined) {
      list[0] = undefined;
    }
    list[1] = label;
    list.label = label;
    list[tag] = label;
    return list;
  };
  const state = {
    list: makeList('before', false),
    stamp: new Date('2026-01-01T00:00:00.000Z')
  };
  const store = {
    share: 'main',
    getPureState: () => state,
    getState: () => state,
    destroy: vi.fn()
  };

  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    {
      rootState: state
    } as any
  );
  const nextStamp = new Date('2026-01-02T00:00:00.000Z');
  state.list = makeList('after', true);
  state.stamp = nextStamp;
  autorunRunner?.();

  const snapshot = replaceExternalStoreState.mock.calls[0][2] as any;
  expect(snapshot.list.length).toBe(2);
  expect(Object.prototype.hasOwnProperty.call(snapshot.list, 0)).toBe(true);
  expect(snapshot.list[0]).toBeUndefined();
  expect(snapshot.list[1]).toBe('after');
  expect(snapshot.list.label).toBe('after');
  expect(snapshot.list[tag]).toBe('after');
  expect(snapshot.stamp).toBe(nextStamp);
});
