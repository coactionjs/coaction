import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import {
  create,
  createBinder,
  type Middleware,
  type Slice,
  type Slices,
  type Store
} from '../src';
import { bindSymbol } from '../src/constant';

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    (set, get, store) => ({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        set((draft) => {
          this.count += 1;
          stateFn(get().count, store.getState().count, this.count, draft.count);
          getterFn(
            get().double,
            store.getState().double,
            this.double,
            draft.double
          );
        });
        stateFn(get().count, store.getState().count, this.count);
        getterFn(get().double, store.getState().double, this.double);
      }
    }),
    {
      name: 'test'
    }
  );
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.name).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  useStore.getState().increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
    1,
  ],
  [
    1,
    1,
    1,
  ],
]
`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    2,
    2,
    2,
    2,
  ],
  [
    2,
    2,
    2,
  ],
]
`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "double": 2,
  "increment": [Function],
}
`);
  increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
    1,
  ],
  [
    1,
    1,
    1,
  ],
  [
    2,
    2,
    2,
    2,
  ],
  [
    2,
    2,
    2,
  ],
]
`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    2,
    2,
    2,
    2,
  ],
  [
    2,
    2,
    2,
  ],
  [
    4,
    4,
    4,
    4,
  ],
  [
    4,
    4,
    4,
  ],
]
`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "double": 4,
  "increment": [Function],
}
`);
});

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: Slice<{
    count: number;
    increment: () => void;
  }> = (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  });
  const useServerStore = create(counter, {
    transport: serverTransport,
    name: 'test'
  });
  const { count, increment } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useServerStore.name).toBe('test');
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
}
`);
  increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
  {
    const useClientStore = create(counter, {
      name: 'test',
      clientTransport
    });

    await new Promise((resolve) => {
      clientTransport.onConnect(() => {
        setTimeout(resolve);
      });
    });

    const { count, increment } = useClientStore();
    expect(count).toBe(2);
    expect(increment).toBeInstanceOf(Function);
    expect(useClientStore.name).toBe('test');
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    const returnValue0 = useClientStore.getState().increment();
    expect(returnValue0 instanceof Promise).toBeTruthy();
    await returnValue0;
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
    const returnValue1 = increment();
    expect(returnValue1 instanceof Promise).toBeTruthy();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
  }
});

test('client mirror rejects direct apply while transport sync still works', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  type State = {
    nested: {
      a: number;
      b: number;
    };
    setA: (a: number) => void;
  };
  const state: Slice<State> = (set) => ({
    nested: {
      a: 0,
      b: 0
    },
    setA(a) {
      set((draft) => {
        draft.nested.a = a;
      });
    }
  });
  let capturedApply: Store<State>['apply'] | undefined;
  const captureApply: Middleware<State> = (store) => {
    capturedApply = store.apply.bind(store);
    return store;
  };
  const useServerStore = create(state, {
    transport: serverTransport,
    name: 'client-apply-rejected'
  });
  useServerStore.getState().setA(1);
  const useClientStore = create(state, {
    name: 'client-apply-rejected',
    clientTransport,
    middlewares: [captureApply]
  });

  await new Promise((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });

  expect(useClientStore.getState().nested).toEqual({
    a: 1,
    b: 0
  });
  expect(() => {
    useClientStore.apply({
      nested: {
        a: 99,
        b: 999
      },
      setA() {}
    });
  }).toThrow(
    'apply() cannot be called in the client store. Client stores are mirrors; use a store method to update the main store instead.'
  );
  expect(() => {
    capturedApply!({
      nested: {
        a: 99,
        b: 999
      },
      setA() {}
    });
  }).toThrow(
    'apply() cannot be called in the client store. Client stores are mirrors; use a store method to update the main store instead.'
  );
  expect(useServerStore.getState().nested).toEqual({
    a: 1,
    b: 0
  });
  expect(useClientStore.getState().nested).toEqual({
    a: 1,
    b: 0
  });

  await useClientStore.getState().setA(2);

  expect(useServerStore.getState().nested).toEqual({
    a: 2,
    b: 0
  });
  expect(useClientStore.getState().nested).toEqual({
    a: 2,
    b: 0
  });
  useServerStore.destroy();
  useClientStore.destroy();
});

test('worker execute returns $$Error for missing method', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  const counter: Slice<{
    count: number;
    increment: () => void;
  }> = (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  });
  const useServerStore = create(counter, {
    transport: serverTransport,
    name: 'worker-missing-method'
  });
  await new Promise((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const [result] = (await clientTransport.emit(
    'execute',
    ['missingMethod'],
    []
  )) as [any, number];
  errorSpy.mockRestore();
  expect(result).toEqual({
    __coactionTransportError__: true,
    message: 'The function is not found'
  });
  useServerStore.destroy();
});

test('worker async action returns resolved value to client', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  const counter: Slice<{
    count: number;
    increment: (step?: number) => Promise<number>;
  }> = (set) => ({
    count: 0,
    async increment(step = 1) {
      set((draft) => {
        draft.count += step;
      });
      await Promise.resolve();
      set((draft) => {
        draft.count += step;
      });
      return this.count;
    }
  });
  const useServerStore = create(counter, {
    transport: serverTransport,
    name: 'worker-async-return'
  });
  const useClientStore = create(counter, {
    name: 'worker-async-return',
    clientTransport
  });
  await new Promise((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });
  const result = await useClientStore.getState().increment(2);
  expect(result).toBe(4);
  expect(useClientStore.getState().count).toBe(4);
  expect(useServerStore.getState().count).toBe(4);
});

test('3rd-party binding does not support slices mode', () => {
  const handleStore = jest.fn();
  const bindThirdParty = createBinder({
    handleStore,
    handleState: ((state: { count: number; increment: () => void }) => ({
      copyState: state,
      bind: (next: { count: number; increment: () => void }) => next
    })) as any
  });
  expect(() => {
    create(
      {
        counter: () =>
          bindThirdParty({
            count: 0,
            increment() {}
          })
      },
      {
        sliceMode: 'slices'
      }
    );
  }).toThrow(
    'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
  );
  expect(handleStore).toHaveBeenCalledTimes(0);
});

test('3rd-party binding marker is hidden unless a keyed adapter must be copied', () => {
  const bindThirdParty = createBinder({
    handleStore: jest.fn(),
    handleState: ((state: { count: number }) => ({
      copyState: state,
      bind: (next: { count: number }) => next
    })) as any
  });
  const keyedBindThirdParty = createBinder({
    handleStore: jest.fn(),
    handleState: ((state: { nested: { count: number } }) => ({
      copyState: state,
      key: 'nested',
      bind: (next: { nested: { count: number } }) => next
    })) as any
  });

  const state = bindThirdParty({
    count: 1
  }) as any;
  const keyedState = keyedBindThirdParty({
    nested: {
      count: 2
    }
  }) as any;

  expect(Object.getOwnPropertyDescriptor(state, bindSymbol)).toMatchObject({
    configurable: true,
    enumerable: false
  });
  expect(Object.getOwnPropertySymbols(state)).toContain(bindSymbol);
  expect(Object.keys(state)).toEqual(['count']);
  expect(Object.prototype.propertyIsEnumerable.call(state, bindSymbol)).toBe(
    false
  );
  expect(
    Object.getOwnPropertyDescriptor(keyedState.nested, bindSymbol)
  ).toMatchObject({
    configurable: true,
    enumerable: true
  });
  expect(Object.getOwnPropertySymbols(keyedState)).not.toContain(bindSymbol);
  expect(Object.keys(keyedState.nested)).toEqual(['count']);
  expect(Object.getOwnPropertySymbols(keyedState.nested)).toContain(bindSymbol);
});

test('3rd-party binding marker supports falsy keyed adapter paths', () => {
  const emptyStringKeyBindThirdParty = createBinder({
    handleStore: jest.fn(),
    handleState: ((state: { '': { count: number } }) => ({
      copyState: state,
      key: '',
      bind: (next: { '': { count: number } }) => next
    })) as any
  });
  const zeroKeyBindThirdParty = createBinder({
    handleStore: jest.fn(),
    handleState: ((state: { 0: { count: number } }) => ({
      copyState: state,
      key: 0,
      bind: (next: { 0: { count: number } }) => next
    })) as any
  });

  const emptyStringKeyedState = emptyStringKeyBindThirdParty({
    '': {
      count: 1
    }
  }) as any;
  const zeroKeyedState = zeroKeyBindThirdParty({
    0: {
      count: 2
    }
  }) as any;

  expect(Object.getOwnPropertySymbols(emptyStringKeyedState)).not.toContain(
    bindSymbol
  );
  expect(Object.getOwnPropertySymbols(emptyStringKeyedState[''])).toContain(
    bindSymbol
  );
  expect(Object.getOwnPropertySymbols(zeroKeyedState)).not.toContain(
    bindSymbol
  );
  expect(Object.getOwnPropertySymbols(zeroKeyedState[0])).toContain(bindSymbol);
});

describe('Store Name Lifecycle', () => {
  const NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV;
  });

  const createMainStore = (
    name: string,
    createState: Slice<{ count: number; increment: () => void }> = (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    })
  ) => {
    const ports = mockPorts();
    const transport = createTransport('WebWorkerInternal', ports.main);
    return create(createState, {
      name,
      transport
    });
  };

  test('name can be reused after destroy in main share mode', () => {
    const useStore = createMainStore('name-reusable');
    expect(() => createMainStore('name-reusable')).toThrow(
      "Store name 'name-reusable' is not unique."
    );
    useStore.destroy();
    let recreatedStore: any;
    expect(() => {
      recreatedStore = createMainStore('name-reusable');
    }).not.toThrow();
    recreatedStore!.destroy();
  });

  test('name is released when create throws in main share mode', () => {
    expect(() =>
      createMainStore('name-released-on-error', () => {
        throw new Error('init failed');
      })
    ).toThrow('init failed');

    let useStore: any;
    expect(() => {
      useStore = createMainStore('name-released-on-error');
    }).not.toThrow();
    useStore!.destroy();
  });

  test('destroy is idempotent in main share mode', () => {
    const useStore = createMainStore('destroy-idempotent');
    expect(() => {
      useStore.destroy();
      useStore.destroy();
    }).not.toThrow();
    let recreatedStore: any;
    expect(() => {
      recreatedStore = createMainStore('destroy-idempotent');
    }).not.toThrow();
    recreatedStore!.destroy();
  });

  test('duplicate name also throws in production for main share mode', () => {
    process.env.NODE_ENV = 'production';
    const useStore = createMainStore('name-production');
    expect(() => createMainStore('name-production')).toThrow(
      "Store name 'name-production' is not unique."
    );
    useStore.destroy();
  });
});

describe('sliceMode', () => {
  test('auto mode preserves slices inference and warns in development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const useStore = create({
        counter: () => ({
          count: 0
        })
      });
      expect(useStore.isSliceStore).toBe(true);
      expect(useStore.getState().counter.count).toBe(0);
      expect(warn).toHaveBeenCalledWith(
        "sliceMode: 'auto' inferred slices from an object of functions. This shape is ambiguous with a single store that only contains methods. Use create({ ping() {} }, { sliceMode: 'single' }) for a plain method store, or create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' }) for slices."
      );
    } finally {
      warn.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  test('single mode treats function maps as a plain store', () => {
    const useStore = create(
      {
        ping() {
          return 'pong';
        }
      },
      {
        sliceMode: 'single'
      }
    );
    expect(useStore.isSliceStore).toBe(false);
    expect((useStore.getState() as any).ping()).toBe('pong');
  });

  test('slices mode validates createState shape', () => {
    expect(() =>
      create(
        {
          count: 0
        } as any,
        {
          sliceMode: 'slices'
        }
      )
    ).toThrow(
      "sliceMode: 'slices' requires createState to be an object of slice functions."
    );
  });
});

describe('Slices', () => {
  test('base', () => {
    const stateFn = jest.fn();
    const getterFn = jest.fn();
    const useStore = create(
      {
        counter: ((set, get, store) => ({
          count: 0,
          get double() {
            return this.count * 2;
          },
          increment() {
            set((draft) => {
              draft.counter.count += 1;
              stateFn(
                get().counter.count,
                store.getState().counter.count,
                this.count,
                draft.counter.count
              );
              getterFn(
                get().counter.double,
                store.getState().counter.double,
                this.double,
                draft.counter.double
              );
            });
            stateFn(
              get().counter.count,
              store.getState().counter.count,
              this.count
            );
            getterFn(
              get().counter.double,
              store.getState().counter.double,
              this.double
            );
          }
        })) satisfies Slices<
          {
            counter: {
              count: number;
              readonly double: number;
              increment: () => void;
            };
          },
          'counter'
        >
      },
      {
        name: 'test',
        sliceMode: 'slices'
      }
    );
    const { count, increment } = useStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useStore.name).toBe('test');
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 0,
    "double": 0,
    "increment": [Function],
  },
}
`);
    const fn = jest.fn();
    useStore.subscribe(fn);
    useStore.getState().counter.increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 1,
    "double": 2,
    "increment": [Function],
  },
}
`);
    increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "double": 4,
    "increment": [Function],
  },
}
`);
  });
  test('worker', async () => {
    const ports = mockPorts();
    const serverTransport = createTransport('WebWorkerInternal', ports.main);
    const clientTransport = createTransport(
      'WebWorkerClient',
      ports.create() as WorkerMainTransportOptions
    );

    const counter: Slices<
      {
        counter: {
          count: number;
          increment: () => void;
        };
      },
      'counter'
    > = (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.counter.count += 1;
        });
      }
    });

    const counter1: Slices<
      {
        counter1: {
          count: number;
          increment: () => void;
        };
      },
      'counter1'
    > = (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.counter1.count += 1;
        });
      }
    });
    const useServerStore = create<{
      counter: Slices<
        {
          counter: {
            count: number;
            increment: () => void;
          };
        },
        'counter'
      >;
      counter1: Slices<
        {
          counter1: {
            count: number;
            increment: () => void;
          };
        },
        'counter1'
      >;
    }>(
      {
        counter,
        counter1
      },
      {
        name: 'test',
        transport: serverTransport,
        sliceMode: 'slices'
      }
    );
    const { count, increment } = useServerStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useServerStore.name).toBe('test');
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
  {
    "count": 0,
    "increment": [Function],
  }
  `);
    const fn = jest.fn();
    useServerStore.subscribe(fn);
    useServerStore.getState().counter.increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
}
`);
    increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
    {
      const useClientStore = create(
        { counter },
        {
          name: 'test',
          clientTransport,
          sliceMode: 'slices'
        }
      );
      await new Promise((resolve) => {
        clientTransport.onConnect(() => {
          setTimeout(resolve);
        });
      });
      const { count, increment } = useClientStore().counter;
      expect(count).toBe(2);
      expect(increment).toBeInstanceOf(Function);
      expect(useClientStore.name).toBe('test');
      expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
  },
}
`);
      const fn = jest.fn();
      useClientStore.subscribe(fn);
      const returnValue0 = useClientStore.getState().counter.increment();
      expect(returnValue0 instanceof Promise).toBeTruthy();
      await returnValue0;
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
      const returnValue1 = increment();
      expect(returnValue1 instanceof Promise).toBeTruthy();
      await returnValue1;
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
    }
  });
});
