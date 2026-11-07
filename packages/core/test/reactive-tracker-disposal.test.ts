import { computed, signal } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';
import { sharedRegistry } from '../src/sharedRegistry';
import { createStore } from '../src/storeFactory';

test.each(['return', 'throw', 'nested', 'reentrant'])(
  'reads after disposal inside a %s callback leave no dependencies',
  (mode) => {
    const { store, internal } = createStore({ a: 1, b: 2 }, {});
    const source = signal(1);
    const read = computed(() => source() * 2);
    const tracker = createReactiveTracker();
    const inner = createReactiveTracker();
    let changes = 0;
    tracker.subscribe(() => changes++);
    const dispose = () => {
      tracker.dispose();
      read();
      void store.getState().b;
    };
    const run = () =>
      tracker.track(() => {
        read();
        void store.getState().a;
        if (mode === 'nested') inner.track(dispose);
        else if (mode === 'reentrant') tracker.track(dispose);
        else dispose();
        read();
        void store.getState().b;
        if (mode === 'throw') throw new Error('callback');
      });
    try {
      if (mode === 'throw') expect(run).toThrow('callback');
      else run();
      inner.dispose();
      expect(tracker.hasDependencies()).toBe(false);
      expect(internal.reactivePathActiveCount ?? 0).toBe(0);
      expect(sharedRegistry.reactiveCollector.active).toBeUndefined();
      source(2);
      store.setState({ a: 2, b: 3 });
      expect(changes).toBe(0);
      expect(read()).toBe(4);
    } finally {
      tracker.dispose();
      inner.dispose();
      store.destroy();
    }
  }
);
