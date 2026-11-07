import { create } from '../src';
import { derive } from 'coaction/derived';

test.each(['index', 'scan', 'getter'])(
  'array accessor values keep the readonly guard through %s reads',
  (mode) => {
    const store = create(() => ({
      items: [] as { n: number }[],
      get first(): { n: number } {
        return this.items[0];
      }
    }));
    let value = 1;
    store.setState((state) => {
      state.items.push({
        get n() {
          return value;
        },
        set n(next: number) {
          value = next;
        }
      });
    });
    const state = store.getState();
    const item =
      mode === 'scan'
        ? state.items.map((row) => row)[0]
        : mode === 'getter'
          ? state.first
          : state.items[0];
    const selected = derive(store, (s) => s.items[0].n, { deep: true });
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    expect(selected()).toBe(1);
    expect(() => {
      item.n = 2;
    }).toThrow('Direct state mutation');
    expect(store.getPureState().items[0].n).toBe(1);
    expect(selected()).toBe(1);
    expect(notifications).toBe(0);
    unsubscribe();
    store.destroy();
  }
);

test.each([false, true])(
  'freezing an element never invokes accessors with nested=%s',
  (nested) => {
    const store = create({ items: [] as { id: number; child: object }[] });
    let reads = 0;
    const accessor = {
      get expensive() {
        reads++;
        return { n: 1 };
      }
    };
    store.setState((state) => {
      state.items.push({ id: 1, child: nested ? { accessor } : accessor });
    });
    reads = 0;
    expect(store.getState().items[0].id).toBe(1);
    expect(reads).toBe(0);
    expect(store.getState().items.map((item) => item.id)).toEqual([1]);
    expect(reads).toBe(0);
    store.destroy();
  }
);

test('objects returned by array element getters remain readonly', () => {
  const store = create({ items: [] as { child: { n: number } }[] });
  store.setState((state) => {
    state.items.push({
      get child() {
        return { n: 1 };
      }
    });
  });
  const child = store.getState().items[0].child;
  expect(() => {
    child.n = 2;
  }).toThrow('Direct state mutation');
  store.destroy();
});

test.each(['metadata', Symbol('metadata')])(
  'scans do not invoke array accessor %s',
  (key) => {
    const store = create({ items: [] as number[] });
    let reads = 0;
    const items = Object.defineProperty([1, 2], key, {
      enumerable: true,
      get() {
        reads++;
        return { n: 1 };
      }
    });
    store.setState((state) => {
      state.items = items;
    });
    reads = 0;
    expect(store.getState().items.map((n) => n * 2)).toEqual([2, 4]);
    expect(reads).toBe(0);
    store.destroy();
  }
);
