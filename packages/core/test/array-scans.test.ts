import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';
import { createStore } from '../src/storeFactory';

type Item = { id: number; label: string };
type Shape = {
  items: Item[];
  query: string;
  other: number;
  rename: (index: number, label: string) => void;
  search: (query: string) => void;
  touchOther: () => void;
};

const createScanStore = () =>
  create<Shape>((set) => ({
    items: [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' }
    ],
    query: 'a',
    other: 0,
    rename(index: number, label: string) {
      set(() => {
        this.items[index].label = label;
      });
    },
    search(query: string) {
      set(() => {
        this.query = query;
      });
    },
    touchOther() {
      set(() => {
        this.other += 1;
      });
    }
  }));

test('a scan depends on the whole array and on what its callback reads', () => {
  const store = createScanStore();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  const matches = () =>
    tracker.track(() => {
      const state = store.getState();
      return state.items.filter((item) => item.label === state.query).length;
    });
  expect(matches()).toBe(1);

  store.getState().touchOther();
  expect(notifications).toBe(0);

  // Any write inside the array reaches a scan of it.
  store.getState().rename(1, 'a');
  expect(notifications).toBe(1);
  expect(matches()).toBe(2);

  // State read inside the callback stays a dependency of its own.
  store.getState().search('b');
  expect(notifications).toBe(2);
  expect(matches()).toBe(0);
  tracker.dispose();
});

test('scans hand out the same element values as index reads', () => {
  const store = createScanStore();
  const items = store.getState().items;
  const [first, second] = items;
  expect(first).toBe(items[0]);
  expect([...items]).toEqual([items[0], items[1]]);
  expect(items.slice(1)[0]).toBe(items[1]);
  expect(items.map((item) => item)[1]).toBe(second);
  for (const [index, item] of items.entries()) {
    expect(item).toBe(items[index]);
  }
  expect(items.includes(items[1])).toBe(true);
  expect(Object.isFrozen(items.find((item) => item.id === 2))).toBe(true);
});

test('a scan of a large array keeps a constant dependency set', () => {
  const { store, internal } = createStore(
    {
      items: Array.from({ length: 1000 }, (_, id) => ({ id, done: id % 2 }))
    },
    {}
  );
  const tracker = createReactiveTracker();
  const done = tracker.track(
    () => store.getState().items.filter((item) => item.done).length
  );
  expect(done).toBe(500);
  expect(internal.reactivePathActiveCount).toBeLessThanOrEqual(2);
  tracker.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('array methods that mutate keep failing through the public state', () => {
  const store = createScanStore();
  expect(() => {
    store.getState().items.push({ id: 3, label: 'c' });
  }).toThrow('Direct state mutation is not allowed');
  expect(() => {
    store.getState().items.sort((a, b) => b.id - a.id);
  }).toThrow('Direct state mutation is not allowed');
  expect(store.getPureState().items.map((item) => item.id)).toEqual([1, 2]);
});

test('a scanned array stays the readonly proxy its key reaches', () => {
  const store = createScanStore();
  const items = store.getState().items;
  expect(items.filter((item) => item.id > 0)).toHaveLength(2);
  // The scan froze the array. Its key still reaches the same proxy, which
  // keeps element reads precise and mutations rejected.
  expect(store.getState().items).toBe(items);
  expect(() => {
    store.getState().items.push({ id: 3, label: 'c' });
  }).toThrow('Direct state mutation is not allowed');
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  expect(tracker.track(() => store.getState().items[0].label)).toBe('a');
  store.getState().rename(1, 'c');
  expect(notifications).toBe(0);
  store.getState().rename(0, 'd');
  expect(notifications).toBe(1);
  tracker.dispose();
});

test('concat hands out the elements of an array it is given frozen', () => {
  const store = create(() => ({ a: [{ id: 1 }], b: [{ id: 2 }] }));
  const state = store.getState();
  const merged = state.a.concat(state.b);
  expect(Object.isFrozen(merged[1])).toBe(true);
  expect(() => {
    (merged[1] as { id: number }).id = 3;
  }).toThrow(TypeError);
  expect(store.getPureState().b[0].id).toBe(2);
  expect(merged[1]).toBe(state.b[0]);
});
