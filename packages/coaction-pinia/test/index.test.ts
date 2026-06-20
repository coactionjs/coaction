// @ts-nocheck
import {
  defineStore,
  createPinia,
  setActivePinia,
  StoreDefinition
} from 'pinia';
import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slices } from 'coaction';
import { bindPinia, adapt, type PiniaStore } from '../src';

test('pinia', () => {
  const useCounterStore: PiniaStore<{
    count: number;
    readonly doubleCount: number;
    increment: () => void;
  }> = defineStore('counter', {
    state: () => ({ count: 0 }),
    getters: {
      doubleCount: (state) => {
        return state.count * 2;
      }
    },
    actions: {
      increment() {
        this.count++;
      }
    }
  });

  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCounterStore();
  expect(store.count).toBe(0);
  expect(store.doubleCount).toBe(0);
  store.increment();
  expect(store.count).toBe(1);
  expect(store.doubleCount).toBe(2);
  store.$state.count = 10;
  expect(store.count).toBe(10);
  expect(store.doubleCount).toBe(20);
});

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  type Counter = {
    count: number;
    readonly double: number;
    increment: () => void;
    increment1: () => void;
  };
  const useStore = create<Counter>(
    (set, get, store) =>
      adapt<Counter>(
        defineStore(
          'test',
          bindPinia({
            state: () => ({ count: 0 }),
            getters: {
              double: (state) => state.count * 2
            },
            actions: {
              increment1() {
                set(() => {
                  this.count += 1;
                });
              },
              increment() {
                this.count += 1;
                stateFn(get().count, store.getState().count, this.count);
                getterFn(get().double, store.getState().double, this.double);
              }
            }
          })
        )
      ),
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
  "increment": [Function],
  "increment1": [Function],
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
  ],
]
`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`
[
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
  "increment": [Function],
  "increment1": [Function],
}
`);
  increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
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
  "increment": [Function],
  "increment1": [Function],
}
`);

  useStore.getState().increment1();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
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
  "count": 3,
  "increment": [Function],
  "increment1": [Function],
}
`);
});

test('apply exact replacement removes stale data keys without deleting actions', () => {
  type Counter = {
    a: number;
    b?: number;
    replaceA: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-exact-replace',
          bindPinia({
            state: () => ({
              a: 1,
              b: 2
            }),
            actions: {
              replaceA() {
                this.a = 4;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-exact-replace'
    }
  );
  const piniaStore = useStore.getPureState() as any;

  useStore.apply({
    a: 3
  } as any);

  expect(useStore.getState().a).toBe(3);
  expect((useStore.getState() as any).b).toBeUndefined();
  expect(piniaStore.b).toBeUndefined();
  expect(typeof useStore.getState().replaceA).toBe('function');
  useStore.getState().replaceA();
  expect(useStore.getState().a).toBe(4);
});

test('apply ignores unsafe prototype keys during replacement', () => {
  type Counter = {
    count: number;
    nested: {
      value: number;
    };
    increment: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-unsafe-replace',
          bindPinia({
            state: () => ({
              count: 0,
              nested: {
                value: 0
              }
            }),
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-unsafe-replace'
    }
  );
  const payload = JSON.parse(
    '{"count":1,"nested":{"value":2,"__proto__":{"nested":true},"constructor":{"value":3}},"__proto__":{"polluted":true},"constructor":{"value":2},"prototype":{"value":3}}'
  );

  useStore.apply(payload as any);

  expect(useStore.getState().count).toBe(1);
  expect(useStore.getState().nested).toEqual({
    value: 2
  });
  expect(Object.getPrototypeOf(useStore.getState())).toBe(Object.prototype);
  expect(Object.getPrototypeOf(useStore.getPureState())).toBe(Object.prototype);
  expect(Object.getPrototypeOf(useStore.getPureState().nested)).toBe(
    Object.prototype
  );
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getState(), '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getState(), 'constructor')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getState(), 'prototype')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      '__proto__'
    )
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      'constructor'
    )
  ).toBe(false);
});

test('initial state ignores nested unsafe prototype keys', () => {
  type Counter = {
    count: number;
    nested: {
      value: number;
    };
    increment: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-unsafe-initial',
          bindPinia({
            state: () =>
              JSON.parse(
                '{"count":1,"nested":{"value":2,"__proto__":{"nested":true},"constructor":{"value":3}}}'
              ),
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-unsafe-initial'
    }
  );

  expect(useStore.getState().nested).toEqual({
    value: 2
  });
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      '__proto__'
    )
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      'constructor'
    )
  ).toBe(false);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(2);
});

test('supports state-only stores without actions', () => {
  type Counter = {
    count: number;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-state-only',
          bindPinia({
            state: () => ({
              count: 0
            })
          })
        )
      ),
    {
      name: 'test-pinia-state-only'
    }
  );
  const piniaStore = useStore.getPureState() as any;

  expect(useStore.getState().count).toBe(0);
  useStore.setState({
    count: 2
  });
  expect(useStore.getState().count).toBe(2);
  expect(piniaStore.count).toBe(2);
});

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  type Counter = {
    count: number;
    increment: () => void;
  };

  const counter = () =>
    adapt<Counter>(
      defineStore(
        'test',
        bindPinia({
          state: () => ({ count: 0 }),
          getters: {
            double: (state) => {
              return state.count * 2;
            }
          },
          actions: {
            increment() {
              this.count += 1;
            }
          }
        })
      )
    );
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
    useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
    increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
  }
});

describe('Slices', () => {
  test('base - unsupported', () => {
    expect(() => {
      create(
        {
          counter: (() =>
            adapt(
              defineStore(
                'test',
                bindPinia({
                  state: () => ({ count: 0 }),
                  getters: {
                    double: (state) => {
                      return state.count * 2;
                    }
                  },
                  actions: {
                    increment() {
                      this.count += 1;
                    }
                  }
                })
              )
            )) satisfies Slices<
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
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
  test('worker - unsupported', () => {
    const ports = mockPorts();
    const serverTransport = createTransport('WebWorkerInternal', ports.main);
    const counter: Slices<
      {
        counter: {
          count: number;
          increment: () => void;
        };
      },
      'counter'
    > = () =>
      adapt(
        defineStore(
          'test',
          bindPinia({
            state: () => ({ count: 0 }),
            getters: {
              double(state) {
                return this.count * 2;
              }
            },
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      );
    expect(() => {
      create(
        { counter },
        {
          name: 'test',
          transport: serverTransport,
          sliceMode: 'slices'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
