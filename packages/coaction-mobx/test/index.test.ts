// @ts-nocheck
import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun } from 'mobx';
import { create, type Slices, type Slice } from 'coaction';

test('mobx', async () => {
  const state = makeAutoObservable({
    value: 0,
    get double() {
      return this.value * 2;
    },
    d() {
      this.value++;
    },
    async increment() {
      this.value++;
      await Promise.resolve();
      this.d();
      await Promise.resolve();
      this.d();
    }
  });
  autorun(() => {
    // console.log('state', state.value, state.double);
  });
  await state.increment();
});

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    (set, get, store) =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          get double() {
            return this.count * 2;
          },
          increment() {
            this.count += 1;
            stateFn(get().count, store.getState().count, this.count);
            getterFn(get().double, store.getState().double, this.double);
          }
        })
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
  "double": 4,
  "increment": [Function],
}
`);
});

test('apply exact replacement removes stale data keys without deleting actions', () => {
  const state = makeAutoObservable(
    bindMobx({
      a: 1,
      b: 2,
      replaceA() {
        this.a = 4;
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-exact-replace'
  });

  useStore.apply({
    a: 3
  } as any);

  expect(useStore.getState().a).toBe(3);
  expect((useStore.getState() as any).b).toBeUndefined();
  expect((state as any).b).toBeUndefined();
  expect(typeof useStore.getState().replaceA).toBe('function');
  useStore.getState().replaceA();
  expect(useStore.getState().a).toBe(4);
});

test('apply ignores unsafe prototype keys during replacement', () => {
  const state = makeAutoObservable(
    bindMobx({
      count: 0,
      nested: {
        value: 0
      },
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-unsafe-replace'
  });
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
  const initialState = JSON.parse(
    '{"count":1,"nested":{"value":2,"__proto__":{"nested":true},"constructor":{"value":3}}}'
  );
  initialState.increment = function increment() {
    this.count += 1;
  };
  const state = makeAutoObservable(bindMobx(initialState));
  const useStore = create(() => state, {
    name: 'test-mobx-unsafe-initial'
  });

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
    increment2: () => void;
    increment3: () => void;
    increment1: () => Promise<void>;
  }> = (set) =>
    makeAutoObservable(
      bindMobx({
        count: 0,
        increment() {
          this.count += 1;
        },
        increment2() {
          this.count += 1;
        },
        async increment1() {
          this.count += 1;
          set(() => {
            this.count += 1;
          });
          this.count += 1;
          set({
            count: this.count + 1
          });
          this.increment2();
        },
        increment3() {
          this.count += 1;
          set(() => {
            this.count += 1;
          });
          this.count += 1;
          set({
            count: this.count + 1
          });
          this.increment2();
        }
      })
    );
  const useServerStore = create(counter, {
    name: 'test',
    transport: serverTransport
  });
  const { count, increment } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useServerStore.name).toBe('test');
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
  increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
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
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    await useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
    await increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);

    await useClientStore.getState().increment1();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 9,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);

    await useClientStore.getState().increment3();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 14,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
  }
});

test('worker - async', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: Slice<{
    count: number;
    increment: () => void;
  }> = () =>
    makeAutoObservable(
      bindMobx({
        count: 0,
        async increment() {
          this.count += 1;
          await Promise.resolve();
          this.count += 1;
        }
      })
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
  useServerStore.subscribe(() => {
    fn(useServerStore.getState().count);
  });
  expect(fn).not.toHaveBeenCalled();
  await useServerStore.getState().increment();
  expect(fn).toHaveBeenCalledTimes(1);
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
  `);
  await increment();
  expect(fn).toHaveBeenCalledTimes(2);
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
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
    expect(count).toBe(4);
    expect(increment).toBeInstanceOf(Function);
    expect(useClientStore.name).toBe('test');
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    await useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 6,
  "increment": [Function],
}
`);
    await increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 8,
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
          counter: ((set, get, store) =>
            makeAutoObservable(
              bindMobx({
                count: 0,
                get double() {
                  return this.count * 2;
                },
                increment() {
                  this.count += 1;
                }
              })
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
      makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
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
