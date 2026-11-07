import { createReactiveTracker } from '../src/reactiveTracker';
import { createStore } from '../src/storeFactory';
import { sharedRegistry } from '../src/sharedRegistry';
import { derive } from '../src/derived';

const pathsOf = (value: object) =>
  (sharedRegistry.publicStatePathMeta.get(value) as { paths: PropertyKey[][] })
    .paths;

test('circular readonly traversal keeps canonical identity and bounded paths', () => {
  const node = { n: 1, self: null as any };
  node.self = node;
  const { store, internal } = createStore({ node }, {});
  const tracker = createReactiveTracker();
  for (let i = 0; i < 1000; i++) {
    tracker.track(() => {
      const value = store.getState().node;
      expect(value.self.self).toBe(value);
      expect(value.self.n).toBe(1);
    });
  }
  expect(pathsOf(store.getState().node)).toEqual([['node']]);
  expect(internal.reactivePathActiveCount).toBeLessThanOrEqual(2);
  tracker.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('distinct alias branches preserve identity and dependencies across replacements', () => {
  const { store, internal } = createStore(
    { anchor: { n: 1 }, dict: {} as Record<string, { n: number }> },
    {}
  );
  const tracker = createReactiveTracker();
  const anchor = store.getPureState().anchor;
  for (let i = 0; i < 1000; i++) {
    store.setState({ anchor, dict: { [String(i)]: anchor } });
    tracker.track(() => {
      const value = store.getState().dict[String(i)];
      expect(value).toBe(store.getState().anchor);
      expect(value.n).toBe(1);
    });
  }
  expect(pathsOf(store.getState().anchor)).toHaveLength(2);
  expect(internal.reactivePathActiveCount).toBeLessThanOrEqual(2);
  let changes = 0;
  tracker.subscribe(() => changes++);
  store.setState({ dict: { '999': { n: 2 } } });
  expect(changes).toBe(1);
  expect(tracker.track(() => store.getState().dict['999'].n)).toBe(2);
  tracker.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test.each(['return', 'throw', 'dispose'])(
  'nested collectors preserve outer traversal marks on %s',
  (mode) => {
    const { store, internal } = createStore(
      { user: { name: 'Ada', age: 20 } },
      {}
    );
    const outer = createReactiveTracker();
    const inner = createReactiveTracker();
    let notifications = 0;
    outer.subscribe(() => notifications++);
    outer.track(() => {
      void store.getState().user.name;
      const read = () =>
        inner.track(() => {
          void store.getState().user.age;
          if (mode === 'throw') throw new Error('nested read');
          if (mode === 'dispose') inner.dispose();
        });
      if (mode === 'throw') expect(read).toThrow('nested read');
      else read();
    });
    store.setState((state) => {
      state.user.age++;
    });
    expect(notifications).toBe(0);
    store.setState((state) => {
      state.user.name = 'Lin';
    });
    expect(notifications).toBe(1);
    outer.dispose();
    inner.dispose();
    expect(internal.reactivePathActiveCount).toBe(0);
    store.destroy();
  }
);

test('nested derived equality does not broaden a sibling leaf dependency', () => {
  const { store, internal } = createStore(
    { user: { name: 'Ada', age: 20 } },
    {}
  );
  const adult = derive(store, (state) => state.user.age >= 18, { deep: true });
  const outer = createReactiveTracker();
  let notifications = 0;
  outer.subscribe(() => notifications++);
  const read = () =>
    outer.track(() => `${store.getState().user.name}:${adult()}`);
  expect(read()).toBe('Ada:true');
  store.setState((state) => {
    state.user.age++;
  });
  expect(notifications).toBe(0);
  store.setState((state) => {
    state.user.age = 10;
  });
  expect(notifications).toBe(1);
  expect(read()).toBe('Ada:false');
  outer.dispose();
  adult.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test.each(['return', 'throw'])(
  'disposing outer collections during an inner %s releases the collection stack',
  (mode) => {
    const { store, internal } = createStore({ user: { n: 0, m: 1 } }, {});
    const outer = createReactiveTracker();
    const middle = createReactiveTracker();
    const inner = createReactiveTracker();
    const read = () =>
      outer.track(() => {
        void store.getState().user.n;
        middle.track(() => {
          void store.getState().user.m;
          inner.track(() => {
            void store.getState().user.n;
            outer.dispose();
            middle.dispose();
            if (mode === 'throw') throw new Error('nested read');
          });
        });
      });
    if (mode === 'throw') expect(read).toThrow('nested read');
    else read();
    inner.dispose();
    expect(sharedRegistry.reactiveCollector.active).toBeUndefined();
    expect(internal.reactivePathActiveCount).toBe(0);
    store.destroy();
  }
);

test('disposing a middle collection preserves the surviving outer traversal marks', () => {
  const { store, internal } = createStore(
    { user: { name: 'Ada', age: 20 } },
    {}
  );
  const outer = createReactiveTracker();
  const middle = createReactiveTracker();
  const inner = createReactiveTracker();
  let notifications = 0;
  outer.subscribe(() => notifications++);
  outer.track(() => {
    void store.getState().user.name;
    middle.track(() => {
      void store.getState().user.age;
      inner.track(() => {
        void store.getState().user.age;
        middle.dispose();
      });
    });
  });
  store.setState((state) => {
    state.user.age++;
  });
  expect(notifications).toBe(0);
  store.setState((state) => {
    state.user.name = 'Lin';
  });
  expect(notifications).toBe(1);
  outer.dispose();
  inner.dispose();
  expect(sharedRegistry.reactiveCollector.active).toBeUndefined();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});
