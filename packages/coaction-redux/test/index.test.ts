import { create, Slices } from 'coaction';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { vi } from 'vitest';
import {
  adapt,
  bindRedux,
  replaceStateAction,
  withCoactionReducer
} from '../src';

test('base', () => {
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
    reducer: withCoactionReducer(counterSlice.reducer)
  });
  const useStore = create(() => adapt(bindRedux(reduxStore)), {
    name: 'test'
  });
  expect(useStore.getState().dispatch).toBeInstanceOf(Function);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
}
`);
  useStore.getState().dispatch(counterSlice.actions.increment());
  expect(useStore.getState().count).toBe(1);
  reduxStore.dispatch(counterSlice.actions.increment());
  expect(useStore.getState().count).toBe(2);
  useStore.setState({
    count: 10
  });
  expect(useStore.getState().count).toBe(10);
  expect(reduxStore.getState().count).toBe(10);
});

test('notifies coaction subscribers after coaction setState dispatches replacement', () => {
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
    reducer: withCoactionReducer(counterSlice.reducer)
  });
  const useStore = create(() => adapt(bindRedux(reduxStore)), {
    name: 'test-redux-set-state-notify'
  });
  const listener = vi.fn();
  const unsubscribe = useStore.subscribe(listener);

  useStore.setState({
    count: 4
  });

  expect(reduxStore.getState().count).toBe(4);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});

test('replace action strips nested functions from payload', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const next = reducer(
    undefined,
    replaceStateAction({
      items: [
        {
          count: 1,
          toText() {
            return String(this.count);
          }
        }
      ],
      nested: {
        value: 2,
        fn() {
          return this.value;
        }
      },
      callback: () => {}
    } as any)
  ) as any;
  expect(next).toMatchInlineSnapshot(`
{
  "items": [
    {
      "count": 1,
    },
  ],
  "nested": {
    "value": 2,
  },
}
  `);
});

test('replace action preserves sparse array holes and properties', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const token = Symbol('array-token');
  const items = [] as any[];
  items.length = 2;
  items[1] = {
    count: 1,
    fn: () => undefined
  };
  items.label = 'items';
  items[token] = {
    value: 2,
    fn: () => undefined
  };
  items.callback = () => undefined;

  const next = reducer(
    undefined,
    replaceStateAction({
      items
    } as any)
  ) as any;

  expect(next.items.length).toBe(2);
  expect(Object.prototype.hasOwnProperty.call(next.items, 0)).toBe(false);
  expect(next.items[1]).toEqual({
    count: 1
  });
  expect(next.items.label).toBe('items');
  expect(next.items[token]).toEqual({
    value: 2
  });
  expect(Object.prototype.hasOwnProperty.call(next.items, 'callback')).toBe(
    false
  );
});

test('replace action preserves enumerable symbol keys', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const token = Symbol('redux-token');
  const nestedToken = Symbol('nested-redux-token');
  const payload = {
    count: 1,
    [token]: {
      value: 2,
      [nestedToken]: 3,
      fn: () => undefined
    }
  };

  const next = reducer(undefined, replaceStateAction(payload as any)) as any;

  expect(next.count).toBe(1);
  expect(next[token]).toEqual({
    value: 2,
    [nestedToken]: 3
  });
  expect(Object.prototype.hasOwnProperty.call(next[token], 'fn')).toBe(false);
});

test('replace action preserves non-plain object values', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const stamp = new Date('2026-01-01T00:00:00.000Z');
  const nestedStamp = new Date('2026-01-02T00:00:00.000Z');

  const next = reducer(
    undefined,
    replaceStateAction({
      stamp,
      nested: {
        stamp: nestedStamp
      }
    } as any)
  ) as any;

  expect(next.stamp).toBe(stamp);
  expect(next.nested.stamp).toBe(nestedStamp);
});

test('replace action ignores inherited payload properties', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const proto = {
    inherited: {
      unsafe: true
    }
  };
  const payload = Object.create(proto) as {
    own: {
      count: number;
    };
  };
  payload.own = {
    count: 1
  };

  const next = reducer(undefined, replaceStateAction(payload as any)) as any;
  expect(next).toEqual({
    own: {
      count: 1
    }
  });
  expect(next.inherited).toBeUndefined();
});

test('replace action ignores unsafe prototype keys', () => {
  const reducer = withCoactionReducer((state = {} as any) => state);
  const payload = JSON.parse(
    '{"count":1,"__proto__":{"polluted":true},"constructor":{"value":2},"prototype":{"value":3},"nested":{"value":4,"__proto__":{"nested":true}}}'
  );

  const next = reducer(undefined, replaceStateAction(payload as any)) as any;

  expect(next.count).toBe(1);
  expect(next.nested).toEqual({
    value: 4
  });
  expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(next.nested)).toBe(Object.prototype);
  expect(Object.prototype.hasOwnProperty.call(next, '__proto__')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(next, 'constructor')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(next, 'prototype')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(next.nested, '__proto__')).toBe(
    false
  );
});

test('external redux updates do not merge binder symbols into state', () => {
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
    reducer: withCoactionReducer(counterSlice.reducer)
  });
  const useStore = create(() => adapt(bindRedux(reduxStore)), {
    name: 'test-no-redux-binder-symbol'
  });

  reduxStore.dispatch(counterSlice.actions.increment());

  expect(useStore.getState().count).toBe(1);
  expect(Object.getOwnPropertySymbols(useStore.getPureState())).toEqual([]);
});

test('external redux replacement removes stale coaction state keys', () => {
  const reduxStore = configureStore({
    reducer: withCoactionReducer(
      (
        state = {
          a: 1,
          b: 2
        },
        action: { type: string }
      ) => {
        if (action.type === 'replace-a') {
          return {
            a: 3
          };
        }
        return state;
      }
    )
  });
  const useStore = create(() => adapt(bindRedux(reduxStore as any)), {
    name: 'test-redux-exact-replace'
  });

  reduxStore.dispatch({
    type: 'replace-a'
  });

  expect(useStore.getPureState()).toEqual({
    a: 3
  });
  expect(useStore.getState().dispatch).toBeInstanceOf(Function);
});

describe('Slices', () => {
  test('base - unsupported', () => {
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
      reducer: withCoactionReducer(counterSlice.reducer)
    });
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              dispatch: typeof reduxStore.dispatch;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () => adapt(bindRedux(reduxStore))
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
});
