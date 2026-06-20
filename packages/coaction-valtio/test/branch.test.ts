import { proxy } from 'valtio/vanilla';
import { vi } from 'vitest';

const loadBinding = async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    },
    onStoreReady: (_store: unknown, callback: () => void) => {
      callback();
      return () => undefined;
    },
    replaceExternalStoreState: vi.fn()
  }));
  await import('../src');
  return {
    capturedHandleStore
  };
};

afterEach(() => {
  vi.doUnmock('coaction');
  vi.doUnmock('valtio/vanilla');
  vi.resetModules();
});

test('falls back to rawState when no mutable mapping exists', async () => {
  const { capturedHandleStore } = await loadBinding();
  const rawState = proxy({
    count: 0
  });
  const store = {
    getPureState: () => rawState,
    getState: () => ({
      count: rawState.count
    })
  };
  const internal = {};
  capturedHandleStore(store as any, rawState as any, rawState as any, internal);
  const listener = vi.fn();
  const unsubscribe = (store as any).subscribe(listener);
  rawState.count = 1;
  await Promise.resolve();
  unsubscribe();
  expect(listener).toHaveBeenCalledTimes(1);
});

test('skips re-initialization when internal mutable mapper already exists', async () => {
  const { capturedHandleStore } = await loadBinding();
  const firstRawState = proxy({
    count: 0
  });
  const secondRawState = proxy({
    count: 10
  });
  const store = {
    getPureState: () => firstRawState,
    getState: () => ({
      count: firstRawState.count
    })
  };
  const internal = {};
  capturedHandleStore(
    store as any,
    firstRawState as any,
    firstRawState as any,
    internal
  );
  const subscribeRef = (store as any).subscribe;
  capturedHandleStore(
    store as any,
    secondRawState as any,
    secondRawState as any,
    internal
  );
  expect((store as any).subscribe).toBe(subscribeRef);
});

test('destroy unsubscribes valtio listener only once', async () => {
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
    sanitizeReplacementState: (value: unknown) => value
  }));
  vi.doMock('valtio/vanilla', () => ({
    proxy: (value: unknown) => value,
    subscribe: vi.fn(() => unsubscribe)
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
