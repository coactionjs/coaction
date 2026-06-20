// __tests__/store.test.ts

import { create } from '../src';
import { Transport } from 'data-transport';

describe('State Management Store Tests', () => {
  let store: ReturnType<typeof create>;
  let initialState: any;

  beforeEach(() => {
    initialState = {
      counter: 0,
      text: 'hello',
      nested: {
        value: 42
      }
    };
    store = create((set, get) => ({
      ...initialState,
      increment: () => set((state: any) => ({ counter: state.counter + 1 })),
      setText: (newText: string) => set({ text: newText }),
      setNestedValue: (newValue: number) =>
        set((state: any) => {
          state.nested.value = newValue;
        })
    }));
  });

  test('should initialize with given state', () => {
    const state = store.getState();
    expect(state.counter).toBe(0);
    expect(state.text).toBe('hello');
    expect(state.nested.value).toBe(42);
  });

  test('should update state immutably', () => {
    store.setState({ counter: 1 });
    const state = store.getState();
    expect(state.counter).toBe(1);
    expect(state.text).toBe('hello');
  });

  test('should ignore unsafe keys during initialization', () => {
    const pollutedKey = '__coactionCreatePolluted__';
    const objectPrototype = Object.prototype as Record<string, unknown>;
    delete objectPrototype[pollutedKey];
    const nestedFn = () => 'kept';

    try {
      const initialState = JSON.parse(
        `{"counter":1,"nested":{"value":2,"__proto__":{"${pollutedKey}":true},"constructor":{"value":3}},"list":[{"value":4,"prototype":{"value":5}}],"__proto__":{"${pollutedKey}":true},"constructor":{"value":2}}`
      );
      initialState.nested.fn = nestedFn;
      const useStore = create(() => initialState);

      expect(useStore.getState().counter).toBe(1);
      expect(useStore.getState().nested).toEqual({
        value: 2,
        fn: nestedFn
      });
      expect(useStore.getState().list).toEqual([
        {
          value: 4
        }
      ]);
      expect(
        Object.prototype.hasOwnProperty.call(useStore.getState(), '__proto__')
      ).toBeFalsy();
      expect(
        Object.prototype.hasOwnProperty.call(
          useStore.getState().nested,
          '__proto__'
        )
      ).toBeFalsy();
      expect(
        Object.prototype.hasOwnProperty.call(
          useStore.getState().nested,
          'constructor'
        )
      ).toBeFalsy();
      expect(
        Object.prototype.hasOwnProperty.call(
          useStore.getState().list[0],
          'prototype'
        )
      ).toBeFalsy();
      expect(objectPrototype[pollutedKey]).toBeUndefined();
    } finally {
      delete objectPrototype[pollutedKey];
    }
  });

  test('should ignore unsafe keys in slices mode', () => {
    const pollutedKey = '__coactionSlicePolluted__';
    const objectPrototype = Object.prototype as Record<string, unknown>;
    delete objectPrototype[pollutedKey];

    try {
      const slices = Object.create(null) as Record<string, any>;
      slices.counter = () =>
        JSON.parse(
          `{"count":1,"nested":{"value":2,"__proto__":{"${pollutedKey}":true},"constructor":{"value":3}},"__proto__":{"${pollutedKey}":true},"prototype":{"value":2}}`
        );
      slices.__proto__ = () => ({
        hidden: true
      });

      const useStore = create(slices, {
        sliceMode: 'slices'
      });

      expect(useStore.getState()).toEqual({
        counter: {
          count: 1,
          nested: {
            value: 2
          }
        }
      });
      expect(
        Object.prototype.hasOwnProperty.call(useStore.getState(), '__proto__')
      ).toBeFalsy();
      expect(
        Object.prototype.hasOwnProperty.call(
          useStore.getState().counter.nested,
          '__proto__'
        )
      ).toBeFalsy();
      expect(
        Object.prototype.hasOwnProperty.call(
          useStore.getState().counter.nested,
          'constructor'
        )
      ).toBeFalsy();
      expect(objectPrototype[pollutedKey]).toBeUndefined();
    } finally {
      delete objectPrototype[pollutedKey];
    }
  });

  test('should preserve symbol keyed state members during initialization', () => {
    const token = Symbol('coaction-symbol');
    const useStore = create(() => ({
      [token]: 1,
      count: 0
    }));

    const state = useStore.getState() as Record<PropertyKey, unknown>;
    expect(state[token]).toBe(1);
    expect(Object.getOwnPropertySymbols(state)).toContain(token);
  });

  test('should preserve circular and shared references during initialization', () => {
    const shared = {
      value: 1
    };
    const initialState = {
      count: 0,
      left: shared,
      right: shared
    } as any;
    initialState.self = initialState;

    const useStore = create(() => initialState);
    const pureState = useStore.getPureState() as any;
    const state = useStore.getState() as any;

    expect(pureState.self).toBe(pureState);
    expect(pureState.left).toBe(pureState.right);
    expect(pureState.left).not.toBe(shared);
    expect(pureState.left).toEqual({
      value: 1
    });
    expect(state.self).toBe(pureState);
    expect(state.left).toBe(state.right);
  });

  test('should preserve circular and shared slice references during initialization', () => {
    const shared = {
      value: 1
    };
    const counterState = {
      count: 0,
      left: shared,
      right: shared
    } as any;
    counterState.self = counterState;

    const useStore = create(
      {
        counter: () => counterState
      },
      {
        sliceMode: 'slices'
      }
    );
    const pureCounter = useStore.getPureState().counter as any;
    const counter = useStore.getState().counter as any;

    expect(pureCounter.self).toBe(pureCounter);
    expect(pureCounter.left).toBe(pureCounter.right);
    expect(pureCounter.left).not.toBe(shared);
    expect(pureCounter.left).toEqual({
      value: 1
    });
    expect(counter.self).toBe(pureCounter);
    expect(counter.left).toBe(counter.right);
  });

  test('should preserve non-enumerable data properties in pure state', () => {
    const state = {
      count: 0
    };
    Object.defineProperty(state, 'hidden', {
      value: 1,
      enumerable: false,
      configurable: true,
      writable: true
    });
    const useStore = create(() => state);

    expect((useStore.getState() as any).hidden).toBe(1);
    expect((useStore.getPureState() as any).hidden).toBe(1);
    expect(Object.keys(useStore.getState())).toEqual(['count']);
    expect(Object.keys(useStore.getPureState())).toEqual(['count']);
    expect(
      Object.prototype.propertyIsEnumerable.call(useStore.getState(), 'hidden')
    ).toBe(false);
    expect(
      Object.prototype.propertyIsEnumerable.call(
        useStore.getPureState(),
        'hidden'
      )
    ).toBe(false);
  });

  test('should preserve and update symbol keyed state members with object updates', () => {
    const token = Symbol('coaction-symbol-update');

    for (const options of [{}, { enablePatches: true }]) {
      const useStore = create(
        () => ({
          [token]: 1,
          count: 0
        }),
        options
      );

      useStore.setState({ count: 1 });
      expect((useStore.getState() as Record<PropertyKey, unknown>)[token]).toBe(
        1
      );

      useStore.setState({ [token]: 2 } as any);
      expect((useStore.getState() as Record<PropertyKey, unknown>)[token]).toBe(
        2
      );
      expect(
        (useStore.getPureState() as Record<PropertyKey, unknown>)[token]
      ).toBe(2);
    }
  });

  test('should support symbol keyed slices', () => {
    const counter = Symbol('counter-slice');
    const useStore = create({
      [counter]: (set: any) => ({
        count: 0,
        increment() {
          set({
            [counter]: {
              count: 1
            }
          } as any);
        }
      })
    } as any);

    expect(useStore.isSliceStore).toBeTruthy();
    expect(Object.getOwnPropertySymbols(useStore.getState())).toContain(
      counter
    );
    expect((useStore.getState() as any)[counter].count).toBe(0);

    (useStore.getState() as any)[counter].increment();
    expect((useStore.getState() as any)[counter].count).toBe(1);

    useStore.setState({
      [counter]: {
        count: 2
      }
    } as any);
    expect((useStore.getPureState() as any)[counter].count).toBe(2);
  });

  test('should wrap symbol keyed actions with current state binding', () => {
    const increment = Symbol('increment');
    const useStore = create((set) => ({
      count: 0,
      [increment]() {
        set({
          count: this.count + 1
        });
      }
    }));
    let calls = 0;
    useStore.subscribe(() => {
      calls += 1;
    });

    const action = (useStore.getState() as any)[increment];
    action();

    expect(useStore.getState().count).toBe(1);
    expect(calls).toBe(1);
  });

  test('should update state using function', () => {
    store.setState((state: any) => ({ counter: state.counter + 5 }));
    const state = store.getState();
    expect(state.counter).toBe(5);
    expect(state.text).toBe('hello');
    expect(state.nested.value).toBe(42);
  });

  test('should handle nested state updates', () => {
    store.setState((state: any) => {
      state.nested.value = 100;
    });
    const state = store.getState();
    expect(state.nested.value).toBe(100);
  });

  test('should execute actions', () => {
    const state = store.getState();
    state.increment();
    const newState = store.getState();
    expect(newState.counter).toBe(1);
  });

  test('should support postfix increment draft updates', () => {
    const useStore = create((set) => ({
      count: 0,
      increment: () => set((state: any) => state.count++)
    }));

    useStore.getState().increment();

    expect(useStore.getState().count).toBe(1);
  });

  test('should subscribe to state changes', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.setState({ counter: 10 });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    store.setState({ counter: 20 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('no support async actions', () => {
    expect(() => {
      store.setState(async (state: any) => {
        state.counter = await Promise.resolve(50);
      });
    }).toThrow('setState with async function is not supported');
    expect(store.getState().counter).toBe(0);
  });

  test('should destroy store correctly', () => {
    const listener = jest.fn();
    store.subscribe(listener);

    store.destroy();
    store.setState({ counter: 100 });

    expect(listener).not.toHaveBeenCalled();
  });

  test('should handle setState within updater error', () => {
    expect(() => {
      store.setState((state: any) => {
        state.counter = 1;
        store.setState({ counter: 2 });
      });
    }).toThrow('setState cannot be called within the updater');
  });

  // test('should not allow async functions in setState when mutableInstance is present', () => {
  //   expect(() => {
  //     store.setState(async (state: any) => {
  //       state.counter = await Promise.resolve(1);
  //     });
  //   }).toThrow('setState with async function is not supported');
  // });

  test('should apply patches correctly', () => {
    const patches = [{ op: 'replace', path: '/text', value: 'world' }];
    // @ts-ignore
    store.apply(undefined, patches);
    const state = store.getState();
    expect(state.text).toBe('world');
  });

  test('apply ignores unsafe keys during full replacement', () => {
    const useStore = create(() => ({
      count: 0,
      nested: {
        value: 0
      }
    }));
    const payload = JSON.parse(
      '{"count":1,"__proto__":{"polluted":true},"constructor":{"value":2},"nested":{"value":3,"__proto__":{"nested":true}}}'
    );

    useStore.apply(payload as any);

    const pureState = useStore.getPureState() as any;
    expect(useStore.getState().count).toBe(1);
    expect(useStore.getState().nested.value).toBe(3);
    expect(Object.getPrototypeOf(pureState)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(pureState.nested)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(pureState, '__proto__')).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(pureState, 'constructor')).toBe(
      false
    );
    expect(
      Object.prototype.hasOwnProperty.call(pureState.nested, '__proto__')
    ).toBe(false);
  });

  test('apply sanitizes patch values and ignores unsafe patch paths', () => {
    const useStore = create(() => ({
      count: 0,
      nested: {
        value: 0
      },
      list: [] as Array<{ value: number }>
    }));
    const nested = JSON.parse(
      '{"value":2,"__proto__":{"polluted":true},"prototype":{"value":3}}'
    );
    const item = JSON.parse(
      '{"value":4,"__proto__":{"polluted":true},"constructor":{"value":5}}'
    );

    useStore.apply(useStore.getPureState(), [
      {
        op: 'replace',
        path: ['nested'],
        value: nested
      },
      {
        op: 'add',
        path: ['list', 0],
        value: item
      },
      {
        op: 'add',
        path: ['__proto__', 'polluted'],
        value: true
      },
      {
        op: 'add',
        path: '/constructor/value',
        value: 2
      }
    ] as any);

    const pureState = useStore.getPureState() as any;
    expect(pureState.nested).toEqual({
      value: 2
    });
    expect(pureState.list[0]).toEqual({
      value: 4
    });
    expect(Object.getPrototypeOf(pureState.nested)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(pureState.list[0])).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(pureState.nested, '__proto__')
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(pureState.nested, 'prototype')
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(pureState.list[0], '__proto__')
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(pureState.list[0], 'constructor')
    ).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
  });

  test('preserves sparse arrays and enumerable array properties', () => {
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
    const useStore = create((set) => ({
      list: makeList('initial', false),
      replaceList() {
        set({
          list: makeList('next', true)
        } as any);
      }
    }));

    const initialList = useStore.getPureState().list as any[];
    expect(initialList.length).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(initialList, 0)).toBe(false);
    expect(initialList[1]).toBe('initial');
    expect(initialList.label).toBe('initial');
    expect(initialList[tag]).toBe('initial');

    useStore.getState().replaceList();
    const nextList = useStore.getPureState().list as any[];
    expect(nextList.length).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(nextList, 0)).toBe(true);
    expect(nextList[0]).toBeUndefined();
    expect(nextList[1]).toBe('next');
    expect(nextList.label).toBe('next');
    expect(nextList[tag]).toBe('next');
  });

  test('apply preserves non-plain object values while sanitizing plain objects', () => {
    const initialStamp = new Date('2024-01-01T00:00:00.000Z');
    const nextStamp = new Date('2024-01-02T00:00:00.000Z');
    const patchStamp = new Date('2024-01-03T00:00:00.000Z');
    const useStore = create(() => ({
      stamp: initialStamp,
      nested: {
        stamp: initialStamp
      }
    }));

    useStore.apply({
      stamp: nextStamp,
      nested: {
        stamp: nextStamp
      }
    });

    expect(useStore.getPureState().stamp).toBe(nextStamp);
    expect(useStore.getPureState().nested.stamp).toBe(nextStamp);

    useStore.apply(useStore.getPureState(), [
      {
        op: 'replace',
        path: ['nested'],
        value: {
          stamp: patchStamp
        }
      }
    ] as any);

    expect(useStore.getPureState().nested.stamp).toBe(patchStamp);
  });
});
