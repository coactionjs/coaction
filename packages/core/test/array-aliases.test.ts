import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';

test.each(['object', 'element', 'scan', 'getter'])(
  'array aliases keep one identity when first read through %s',
  (firstRead) => {
    const item = { name: 'Ada', nested: { n: 1 } };
    const store = create(() => ({
      selected: item,
      items: [item],
      get first(): typeof item {
        return this.items[0];
      }
    }));
    const state = store.getState();
    const reads = {
      object: () => state.selected,
      element: () => state.items[0],
      scan: () => state.items.map((value) => value)[0],
      getter: () => state.first
    };
    const first = reads[firstRead as keyof typeof reads]();
    for (const read of Object.values(reads)) expect(read()).toBe(first);
    expect(state.items.includes(first)).toBe(true);
    expect(state.items.indexOf(first)).toBe(0);
    expect(state.items.find((value) => value === first)).toBe(first);
    expect(() => {
      first.nested.n = 7;
    }).toThrow(Error);
    expect(store.getPureState().items[0].nested.n).toBe(1);

    const replacement = { name: 'Lin', nested: { n: 2 } };
    store.setState({ selected: replacement, items: [replacement] });
    const next = reads[firstRead as keyof typeof reads]();
    expect(next).not.toBe(first);
    for (const read of Object.values(reads)) expect(read()).toBe(next);
    store.destroy();
  }
);

test('an array value preserves a previously exposed descendant proxy', () => {
  const item = { nested: { n: 1 } };
  const store = create({ selected: item.nested, items: [item] });
  const selected = store.getState().selected;
  const element = store.getState().items[0];
  expect(element.nested).toBe(selected);
  expect(store.getState().items.map((value) => value.nested)[0]).toBe(selected);
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  expect(tracker.track(() => store.getState().items[0].nested.n)).toBe(1);
  store.setState({ items: [{ nested: { n: 2 } }] });
  expect(notifications).toBe(1);
  expect(tracker.track(() => store.getState().items[0].nested.n)).toBe(2);
  tracker.dispose();
  store.destroy();
});

test('an already-scanned array keeps its proxy through an array alias', () => {
  const list = [{ n: 1 }];
  const store = create({ list, rows: [list] });
  const exposed = store.getState().list;
  exposed.map((value) => value.n);
  expect(store.getState().rows[0]).toBe(exposed);
  expect(store.getState().rows.slice()[0]).toBe(exposed);
  store.destroy();
});

test('self-referencing arrays keep canonical identity through scans', () => {
  const items: unknown[] = [];
  items.push(items);
  const store = create({ items });
  const exposed = store.getState().items;
  expect(exposed[0]).toBe(exposed);
  expect(exposed.map((value) => value)[0]).toBe(exposed);
  expect(exposed.includes(exposed)).toBe(true);
  store.destroy();
});

test('array elements referring to the root keep the public facade', () => {
  const root = { n: 1, items: [] as unknown[] };
  root.items.push(root);
  const store = create(root);
  expect(store.getState().items[0]).toBe(store.getState());
  expect(store.getState().items.slice()[0]).toBe(store.getState());
  store.destroy();
});

test('array elements referring to another slice keep its public facade', () => {
  const store = create({
    list: () => ({ items: [] as unknown[] }),
    counter: () => ({ n: 1 })
  });
  store.setState((state) => {
    state.list.items = [state.counter];
  });
  const counter = store.getState().counter;
  expect(store.getState().list.items[0]).toBe(counter);
  expect(store.getState().list.items.slice()[0]).toBe(counter);
  store.destroy();
});

test('scan callbacks receive the public array and preserve their this argument', () => {
  const store = create({ items: [{ n: 1 }] });
  const items = store.getState().items;
  const context = { n: 2 };
  expect(
    items.map(function (this: typeof context, item, index, array) {
      expect(this).toBe(context);
      expect(array).toBe(items);
      expect(index).toBe(0);
      return item.n + this.n;
    }, context)
  ).toEqual([3]);
  expect(
    items.reduce((sum, item, index, array) => {
      expect(array).toBe(items);
      expect(index).toBe(0);
      return sum + item.n;
    }, 0)
  ).toBe(1);
  store.destroy();
});

test('an element a recipe selects stays the element it was found as', () => {
  const store = create<{
    selected: { id: number } | null;
    items: { id: number }[];
    select: (id: number) => void;
  }>((set) => ({
    selected: null,
    items: [{ id: 1 }, { id: 2 }],
    select(id) {
      set(() => {
        this.selected = this.items.find((item) => item.id === id)!;
      });
    }
  }));
  store.getState().select(2);
  const state = store.getState();
  expect(state.selected).toBe(state.items[1]);
  expect(state.selected).toBe(state.items.find((item) => item.id === 2));
  store.destroy();
});

test('a selected alias still notifies a reader when it changes', () => {
  const item = { id: 1, nested: { n: 1 } };
  const store = create(() => ({ selected: item, items: [item], other: 0 }));
  const tracker = createReactiveTracker();
  let notifications = 0;
  tracker.subscribe(() => notifications++);
  // The element is read first, so the alias reads as the frozen element too.
  expect(store.getState().items[0].id).toBe(1);
  expect(tracker.track(() => store.getState().selected.nested.n)).toBe(1);
  store.setState({ other: 1 });
  expect(notifications).toBe(0);
  store.setState((state) => {
    state.selected = { id: 1, nested: { n: 2 } };
  });
  expect(notifications).toBe(1);
  expect(tracker.track(() => store.getState().selected.nested.n)).toBe(2);
  tracker.dispose();
  store.destroy();
});

test('an array stays open while its proxy is scanned, and is not handed out', () => {
  const store = create(() => ({ items: [{ n: 1 }] }));
  const pure = store.getPureState();
  let received: unknown;
  store.getState().items.forEach((_, __, array) => {
    received = array;
  });
  expect(received).toBe(store.getState().items);
  expect(received).not.toBe(pure.items);
  expect(Object.isFrozen(pure.items)).toBe(false);
  expect(Object.isFrozen(pure.items[0])).toBe(true);
  store.destroy();
});
