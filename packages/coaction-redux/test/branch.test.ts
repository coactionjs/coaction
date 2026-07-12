import { configureStore, createSlice } from '@reduxjs/toolkit';
import { vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('coaction/adapter');
  vi.resetModules();
});

test('throws when redux binding is created in client share mode', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  vi.doMock('coaction/adapter', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    }
  }));
  const { bindRedux } = await import('../src');
  const counterSlice = createSlice({
    name: 'counter',
    initialState: {
      count: 0
    },
    reducers: {
      increment(state) {
        state.count += 1;
      }
    }
  });
  const reduxStore = configureStore({
    reducer: counterSlice.reducer
  });
  bindRedux(reduxStore);
  expect(() => {
    capturedHandleStore(
      {
        share: 'client'
      },
      {},
      {},
      {}
    );
  }).toThrow('client redux store cannot be updated');
});

test('redux binding unsubscribes from redux store on destroy', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  vi.doMock('coaction/adapter', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    }
  }));
  const { bindRedux } = await import('../src');
  const counterSlice = createSlice({
    name: 'counter',
    initialState: {
      count: 0
    },
    reducers: {
      increment(state) {
        state.count += 1;
      }
    }
  });
  const reduxStore = configureStore({
    reducer: counterSlice.reducer
  });
  bindRedux(reduxStore);

  const unsubscribe = vi.fn(() => {
    if (unsubscribe.mock.calls.length > 1) {
      throw new Error('unsubscribe called twice');
    }
  });
  const subscribeSpy = vi
    .spyOn(reduxStore, 'subscribe')
    .mockImplementation(() => unsubscribe);
  const baseDestroy = vi.fn();
  const store = {
    share: false,
    setState: vi.fn(),
    destroy: baseDestroy
  };
  const internal = {
    updateImmutable: undefined
  };
  capturedHandleStore(store as any, {}, {}, internal as any);
  expect(subscribeSpy).toHaveBeenCalledTimes(1);

  store.destroy();
  expect(() => store.destroy()).not.toThrow();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});
