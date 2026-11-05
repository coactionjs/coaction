import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';
import { trackReadonlyStateValue } from '../src/getRawStateStateProperty';

type Item = { id: number; label: string; tags: string[] };
type Shape = {
  items: Item[];
  owner: { name: string };
  readonly second: Item;
  rename: (index: number, label: string) => void;
  renameOwner: (name: string) => void;
};

const createStore = () =>
  create<Shape>((set) => ({
    items: [
      { id: 1, label: 'a', tags: ['x'] },
      { id: 2, label: 'b', tags: ['y'] }
    ],
    owner: { name: 'Ada' },
    get second() {
      return this.items[1];
    },
    rename(index: number, label: string) {
      set(() => {
        this.items[index].label = label;
      });
    },
    renameOwner(name: string) {
      set(() => {
        this.owner.name = name;
      });
    }
  }));

test('array elements leave the store as frozen values', () => {
  const store = createStore();
  const first = store.getState().items[0];
  expect(first).toBe(store.getPureState().items[0]);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.tags)).toBe(true);
  expect(() => {
    (first as { label: string }).label = 'z';
  }).toThrow(TypeError);
  expect(store.getPureState().items[0].label).toBe('a');
  // Objects reached through object keys stay readonly proxies.
  expect(store.getState().owner).not.toBe(store.getPureState().owner);
  expect(() => {
    store.getState().owner.name = 'Lin';
  }).toThrow('Direct state mutation is not allowed');
});

test('an element is the same value however it is reached', () => {
  const store = createStore();
  const state = store.getState();
  const tracker = createReactiveTracker();
  const tracked = tracker.track(() => store.getState().items[1]);
  expect(tracked).toBe(state.items[1]);
  expect(state.items.find((item) => item.id === 2)).toBe(state.items[1]);
  expect(state.items.indexOf(state.items[1])).toBe(1);
  expect(state.second).toBe(state.items[1]);
  tracker.dispose();
});

test('a reader depends on the identity of the elements it reads', () => {
  const store = createStore();
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  expect(tracker.track(() => store.getState().items[0].label)).toBe('a');

  store.getState().rename(1, 'c');
  expect(notifications).toBe(0);

  store.getState().rename(0, 'd');
  expect(notifications).toBe(1);
  expect(tracker.track(() => store.getState().items[0].label)).toBe('d');
  tracker.dispose();
});

test('a write copies the element instead of editing the frozen value', () => {
  const store = createStore();
  const before = store.getState().items[0];
  store.getState().rename(0, 'e');
  const after = store.getState().items[0];
  expect(after).not.toBe(before);
  expect(before.label).toBe('a');
  expect(after.label).toBe('e');
  expect(after.tags).toBe(before.tags);
});

test('replacement values are copied before they are frozen', () => {
  const store = createStore();
  const items = [{ id: 3, label: 'f', tags: [] }];
  store.setState({ items });
  expect(store.getState().items[0].label).toBe('f');
  expect(Object.isFrozen(store.getState().items[0])).toBe(true);
  expect(Object.isFrozen(items[0])).toBe(false);
});

test('freezing an element reaches the named extras of an array', () => {
  const tag = Symbol('tag');
  const row = Object.assign([{ id: 1 }], {
    meta: { note: 'x' },
    [tag]: { note: 'y' }
  });
  // A recipe assigns an array as it is; a store's first copy keeps its elements.
  const store = create<{ rows: unknown[] }>(() => ({ rows: [] }));
  store.setState((draft) => {
    draft.rows = [row];
  });
  const first = store.getState().rows[0] as typeof row;
  expect(Object.isFrozen(first[0])).toBe(true);
  expect(Object.isFrozen(first.meta)).toBe(true);
  expect(Object.isFrozen(first[tag])).toBe(true);
  expect(() => {
    first.meta.note = 'z';
  }).toThrow(TypeError);
  expect((store.getPureState().rows[0] as typeof row).meta.note).toBe('x');
});

test('a frozen object in the state hands out only its own values', () => {
  const config = Object.freeze({ mode: 'dark', theme: { accent: 'red' } });
  const store = create((set) => ({
    config: { mode: 'light', theme: { accent: 'blue' } },
    use(next: typeof config) {
      set((draft) => {
        draft.config = next;
      });
    }
  }));
  // Assigned in a recipe, the frozen object is kept as it is, and reads reach
  // it through a readonly proxy.
  store.getState().use(config);
  const view = store.getState().config as typeof config & {
    __proto__: object;
  };
  expect(view.theme).toBe(config.theme);
  const tracker = createReactiveTracker();
  tracker.track(() => (store.getState().config as typeof view).__proto__);
  tracker.dispose();
  void view.__proto__;
  expect(Object.isFrozen(Object.prototype)).toBe(false);
});

test('a getter returns an element copied before any getter returned one', () => {
  const store = create<{
    items: { id: number; label: string }[];
    readonly label: string;
    readonly second: { id: number; label: string };
    rename: (label: string) => void;
  }>((set) => ({
    items: [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' }
    ],
    get label() {
      return this.items[1].label;
    },
    get second() {
      return this.items[1];
    },
    rename(label: string) {
      set(() => {
        this.items[1].label = label;
      });
    }
  }));
  // A getter that returns a value builds the snapshots; the write then copies
  // the element's snapshot before anything asked which values sit in arrays.
  expect(store.getState().label).toBe('b');
  store.getState().rename('c');
  const state = store.getState();
  expect(state.second).toBe(state.items[1]);
  expect(state.second.label).toBe('c');
});

test('the values a store hands out are frozen when it first hands one out', () => {
  const tags = ['x'];
  const initial = { items: [{ id: 1, tags }], owner: { name: 'Ada' } };
  const store = create(() => initial);
  const pure = store.getPureState();
  // Reading the plain data hands nothing out.
  expect(Object.isFrozen(pure.items)).toBe(false);
  expect(trackReadonlyStateValue(pure.items[0])).toBe(false);
  // The first object read through the state freezes every value the copy
  // settled, not only the one read.
  expect(store.getState().owner.name).toBe('Ada');
  expect(Object.isFrozen(pure.items)).toBe(true);
  expect(Object.isFrozen(pure.items[0])).toBe(true);
  expect(Object.isFrozen(pure.items[0].tags)).toBe(true);
  expect(trackReadonlyStateValue(pure.items[0])).toBe(true);
  expect(trackReadonlyStateValue(pure.items[0].tags)).toBe(true);
  // Objects reached through object keys stay open behind their readonly views.
  expect(Object.isFrozen(pure)).toBe(false);
  expect(Object.isFrozen(pure.owner)).toBe(false);
  // The factory's own objects are copied, never frozen.
  expect(Object.isFrozen(initial.items[0])).toBe(false);
  expect(Object.isFrozen(tags)).toBe(false);
  expect(store.getState().items[0]).toBe(pure.items[0]);
  store.destroy();
});

test('a store read only as plain data freezes nothing, before or after a commit', () => {
  const store = create((set) => ({
    items: [{ id: 1, tags: ['x'] }],
    other: 0,
    touch() {
      set(() => {
        this.other += 1;
      });
    }
  }));
  const before = store.getPureState().items;
  store.getState().touch();
  const pure = store.getPureState();
  expect(pure.items).toBe(before);
  expect(Object.isFrozen(pure.items)).toBe(false);
  expect(Object.isFrozen(pure.items[0])).toBe(false);
  // What is handed out after the commit is frozen and recorded as it is.
  const item = store.getState().items[0];
  expect(item).toBe(pure.items[0]);
  expect(Object.isFrozen(item)).toBe(true);
  expect(Object.isFrozen(item.tags)).toBe(true);
  expect(trackReadonlyStateValue(item)).toBe(true);
  expect(trackReadonlyStateValue(item.tags)).toBe(true);
  store.destroy();
});

test('an array holding an element of another array is frozen when it is first scanned', () => {
  const shared = { id: 1, meta: { n: 1 } };
  const store = create(() => ({ first: [shared], second: [shared] }));
  const pure = store.getPureState();
  expect(store.getState().first[0]).toBe(pure.first[0]);
  // The element settled with the array copied first; the second array holds
  // an alias of it and is left for its first scan.
  expect(Object.isFrozen(pure.first)).toBe(true);
  expect(Object.isFrozen(pure.second)).toBe(false);
  const scanned = store.getState().second.map((item) => item);
  expect(scanned[0]).toBe(pure.first[0]);
  expect(Object.isFrozen(pure.second)).toBe(true);
  expect(trackReadonlyStateValue(pure.second)).toBe(true);
  expect(Object.isFrozen(pure.first[0].meta)).toBe(true);
  store.destroy();
});

test('an array holding an alias or a cycle is frozen when it is first scanned', () => {
  const shared = { id: 1, meta: { n: 1 } };
  const node: Record<string, unknown> = { id: 2 };
  node.self = node;
  const store = create(() => ({
    selected: shared,
    items: [shared],
    nodes: [node]
  }));
  const pure = store.getPureState();
  // The alias is copied through `selected` first, outside any array, and a
  // cycle holds itself open: neither array can be frozen as it is copied.
  expect(Object.isFrozen(pure.items)).toBe(false);
  expect(Object.isFrozen(pure.nodes)).toBe(false);
  const scanned: object[] = [];
  store.getState().items.forEach((item) => scanned.push(item));
  store.getState().nodes.forEach((item) => scanned.push(item as object));
  expect(scanned.every((value) => Object.isFrozen(value))).toBe(true);
  expect(Object.isFrozen((scanned[0] as typeof shared).meta)).toBe(true);
  expect(Object.isFrozen(pure.items)).toBe(true);
});
