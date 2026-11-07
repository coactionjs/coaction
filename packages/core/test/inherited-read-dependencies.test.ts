import { create, effect } from '../src';
import { derive } from '../src/derived';
import { createReactiveTracker } from '../src/reactiveTracker';
import { createStore } from '../src/storeFactory';

const inheritedArray = (value: unknown) => {
  const items = new Array(2);
  items[1] = 2;
  Object.setPrototypeOf(
    items,
    Object.assign(Object.create(Array.prototype), { 0: value })
  );
  return items;
};

test.each([1, undefined, null, 'inherited', () => 1])(
  'shadowing inherited value %s invalidates a precise tracker',
  (value) => {
    const { store, internal } = createStore({ items: [] as unknown[] }, {});
    store.setState((state) => {
      state.items = inheritedArray(value);
    });
    const tracker = createReactiveTracker();
    let changes = 0;
    tracker.subscribe(() => changes++);
    try {
      expect(
        tracker.track(() => {
          const items = store.getState().items;
          return [items[0], items[1]];
        })
      ).toEqual([value, 2]);
      store.setState((state) => {
        state.items[0] = 3;
      });
      expect(changes).toBe(1);
    } finally {
      tracker.dispose();
      store.destroy();
    }
    expect(internal.reactivePathActiveCount).toBe(0);
  }
);

test('deep derived selectors refresh after shadowing an inherited index', () => {
  const store = create({ items: [] as number[] });
  store.setState((state) => {
    state.items = inheritedArray(1);
  });
  const selected = derive(store, (s) => s.items[0] + s.items[1], {
    deep: true
  });
  const seen: number[] = [];
  const stop = effect(() => {
    seen.push(selected());
  });
  try {
    store.setState((state) => {
      state.items[0] = 3;
    });
    expect(seen).toEqual([3, 5]);
    expect(selected()).toBe(5);
  } finally {
    stop();
    selected.dispose();
    store.destroy();
  }
});
