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

    try {
      const useStore = create(() =>
        JSON.parse(
          `{"counter":1,"__proto__":{"${pollutedKey}":true},"constructor":{"value":2}}`
        )
      );

      expect(useStore.getState()).toEqual({
        counter: 1
      });
      expect(
        Object.prototype.hasOwnProperty.call(useStore.getState(), '__proto__')
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
          `{"count":1,"__proto__":{"${pollutedKey}":true},"prototype":{"value":2}}`
        );
      slices.__proto__ = () => ({
        hidden: true
      });

      const useStore = create(slices, {
        sliceMode: 'slices'
      });

      expect(useStore.getState()).toEqual({
        counter: {
          count: 1
        }
      });
      expect(
        Object.prototype.hasOwnProperty.call(useStore.getState(), '__proto__')
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
      [counter]: (set) => ({
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
});
