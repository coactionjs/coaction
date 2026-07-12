import { create } from '../src';
import { createSelectorWithArray } from '../src/computed';

test('accessor getters are cached computed values', () => {
  let getterCalls = 0;
  const store = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      getterCalls += 1;
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  expect(store.getState().double).toBe(0);
  expect(getterCalls).toBe(1);

  store.getState().increment();

  expect(store.getState().double).toBe(2);
  expect(store.getState().double).toBe(2);
  expect(getterCalls).toBe(2);
});

test('accessor getters read frozen raw state without weakening public guards', () => {
  let sawFrozenItems = false;
  const store = create<{
    items: Array<{ value: number }>;
    readonly total: number;
    increment: () => void;
    replace: () => void;
  }>((set) => ({
    items: [{ value: 1 }],
    get total() {
      sawFrozenItems =
        Object.isFrozen(this.items) && Object.isFrozen(this.items[0]);
      return this.items.reduce((sum, item) => sum + item.value, 0);
    },
    increment() {
      set((draft) => {
        draft.items[0].value += 1;
      });
    },
    replace() {
      set((draft) => {
        draft.items[0] = { value: 4 };
      });
    }
  }));

  expect(store.getState().total).toBe(1);
  expect(sawFrozenItems).toBe(true);

  store.getState().increment();

  sawFrozenItems = false;
  expect(store.getState().total).toBe(2);
  expect(sawFrozenItems).toBe(true);
  store.getState().replace();
  sawFrozenItems = false;
  expect(store.getState().total).toBe(4);
  expect(sawFrozenItems).toBe(true);
  expect(() => {
    store.getState().items[0].value = 5;
  }).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores.'
  );
});

test('accessor getters cannot mutate the frozen state used for computation', () => {
  const store = create<{
    nested: { count: number };
    readonly invalid: number;
  }>(() => ({
    nested: { count: 1 },
    get invalid() {
      this.nested.count += 1;
      return this.nested.count;
    }
  }));

  expect(() => store.getState().invalid).toThrow(TypeError);
  expect(store.getPureState().nested.count).toBe(1);
});

test('object-valued computed results retain public state identity', () => {
  const store = create<{
    items: Array<{ value: number }>;
    readonly first: { value: number };
    replace: () => void;
  }>((set) => ({
    items: [{ value: 1 }],
    get first() {
      return this.items[0];
    },
    replace() {
      set((draft) => {
        draft.items[0] = { value: 2 };
      });
    }
  }));

  expect(store.getState().first).toBe(store.getState().items[0]);
  store.getState().replace();
  expect(store.getState().first).toBe(store.getState().items[0]);
  expect(store.getState().first.value).toBe(2);
  expect(() => {
    store.getState().first.value = 2;
  }).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores.'
  );
});

test('accessor getters read fresh draft values during mutation', () => {
  const seen: number[] = [];
  const store = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    increment() {
      set(() => {
        this.count += 1;
        seen.push(this.double);
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  store.getState().increment();

  expect(seen).toEqual([2]);
  expect(store.getState().double).toBe(2);
});

test('failed mutations do not poison accessor computed cache', () => {
  const store = create<{
    count: number;
    readonly double: number;
    fail: () => void;
    setTen: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    fail() {
      set(() => {
        this.count = 10;
        void this.double;
        throw new Error('boom');
      });
    },
    setTen() {
      set(() => {
        this.count = 10;
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  expect(() => store.getState().fail()).toThrow('boom');
  expect(store.getState().count).toBe(0);
  expect(store.getState().double).toBe(0);

  store.getState().setTen();

  expect(store.getState().double).toBe(20);
});

test('manual get dependencies use signal-backed computed caching', () => {
  let selectorCalls = 0;
  const seen: number[] = [];
  const store = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set, get) => ({
    count: 0,
    double: get(
      (state) => [state.count],
      (count) => {
        selectorCalls += 1;
        return count * 2;
      }
    ),
    increment() {
      set(() => {
        this.count += 1;
        seen.push(this.double);
      });
    }
  }));

  expect(store.getState().double).toBe(0);
  expect(store.getState().double).toBe(0);
  expect(selectorCalls).toBe(1);

  store.getState().increment();

  expect(seen).toEqual([2]);
  expect(store.getState().double).toBe(2);
  expect(store.getState().double).toBe(2);
  expect(selectorCalls).toBe(2);
});

test('manual get dependencies compute on first read with empty deps', () => {
  let selectorCalls = 0;
  const store = create<{ readonly answer: number }>((_, get) => ({
    answer: get(
      () => [],
      () => {
        selectorCalls += 1;
        return 42;
      }
    )
  }));

  expect(store.getState().answer).toBe(42);
  expect(store.getState().answer).toBe(42);
  expect(selectorCalls).toBe(1);
});

test('manual get dependencies distinguish sparse holes from undefined', () => {
  let selectorCalls = 0;
  const makeList = (includeUndefined: boolean) => {
    const list = [] as (string | undefined)[];
    list.length = 1;
    if (includeUndefined) {
      list[0] = undefined;
    }
    return list;
  };
  const store = create<{
    list: (string | undefined)[];
    readonly dependencyVersion: number;
    setExplicitUndefined: () => void;
  }>((set, get) => ({
    list: makeList(false),
    dependencyVersion: get(
      (state) => state.list,
      (..._deps: (string | undefined)[]) => {
        selectorCalls += 1;
        return selectorCalls;
      }
    ),
    setExplicitUndefined() {
      set({
        list: makeList(true)
      });
    }
  }));

  expect(store.getState().dependencyVersion).toBe(1);
  expect(selectorCalls).toBe(1);

  store.getState().setExplicitUndefined();

  expect(store.getState().dependencyVersion).toBe(2);
  expect(selectorCalls).toBe(2);
});

test('createSelectorWithArray supports calls without an object receiver', () => {
  let selectorCalls = 0;
  const selector = createSelectorWithArray(
    () => [2],
    (count) => {
      selectorCalls += 1;
      return count * 2;
    }
  );
  const objectSelector = createSelectorWithArray(
    (state: { count: number }) => [state.count],
    (count) => {
      selectorCalls += 1;
      return count * 2;
    }
  );
  const receiver = {
    count: 3
  };

  expect(selector()).toBe(4);
  expect(selector()).toBe(4);
  expect(objectSelector.call(receiver)).toBe(6);
  expect(objectSelector.call(receiver)).toBe(6);
  expect(selectorCalls).toBe(2);
});
