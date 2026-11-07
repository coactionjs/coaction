import { signal } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';
import { createStore } from '../src/storeFactory';
import { sharedRegistry } from '../src/sharedRegistry';

test.each(['return', 'throw'])(
  'reentrant tracking preserves reads before, inside and after an inner %s',
  (mode) => {
    const { store, internal } = createStore({ a: 0, b: 0, c: 0, other: 0 }, {});
    const signals = [signal(0), signal(0), signal(0)];
    const tracker = createReactiveTracker();
    let changes = 0;
    tracker.subscribe(() => changes++);
    const read = () =>
      tracker.track(() => {
        signals[0]();
        void store.getState().a;
        const nested = () =>
          tracker.track(() => {
            signals[1]();
            void store.getState().b;
            if (mode === 'throw') throw new Error('nested');
          });
        if (mode === 'throw') expect(nested).toThrow('nested');
        else nested();
        signals[2]();
        return store.getState().c;
      });
    try {
      expect(read()).toBe(0);
      store.setState({ other: 1 });
      expect(changes).toBe(0);
      for (const key of ['a', 'b', 'c'] as const) {
        const before = changes;
        store.setState((state) => {
          state[key]++;
        });
        expect(changes).toBe(before + 1);
        read();
      }
      for (const source of signals) {
        const before = changes;
        source(1);
        expect(changes).toBe(before + 1);
        read();
      }
      tracker.track(() => store.getState().other);
      const before = changes;
      signals[0](2);
      store.setState({ a: 2 });
      expect(changes).toBe(before);
    } finally {
      tracker.dispose();
      store.destroy();
    }
    expect(internal.reactivePathActiveCount).toBe(0);
    expect(sharedRegistry.reactiveCollector.active).toBeUndefined();
  }
);

test.each(['return', 'throw', 'dispose'])(
  'crossed tracker reentry restores the surrounding collector on %s',
  (mode) => {
    const { store, internal } = createStore({ user: { a: 0, b: 0, c: 0 } }, {});
    const outer = createReactiveTracker();
    const middle = createReactiveTracker();
    let outerChanges = 0;
    let middleChanges = 0;
    outer.subscribe(() => outerChanges++);
    middle.subscribe(() => middleChanges++);
    const read = () =>
      outer.track(() => {
        void store.getState().user.a;
        middle.track(() => {
          void store.getState().user.b;
          const nested = () =>
            outer.track(() => {
              void store.getState().user.c;
              if (mode === 'throw') throw new Error('nested');
              if (mode === 'dispose') outer.dispose();
            });
          if (mode === 'throw') expect(nested).toThrow('nested');
          else nested();
        });
      });
    try {
      read();
      expect(sharedRegistry.reactiveCollector.active).toBeUndefined();
      store.setState((state) => {
        state.user.c++;
      });
      expect(outerChanges).toBe(mode === 'dispose' ? 0 : 1);
      expect(middleChanges).toBe(0);
      store.setState((state) => {
        state.user.b++;
      });
      expect(middleChanges).toBe(1);
    } finally {
      outer.dispose();
      middle.dispose();
      store.destroy();
    }
    expect(internal.reactivePathActiveCount).toBe(0);
    expect(sharedRegistry.reactiveCollector.active).toBeUndefined();
  }
);
