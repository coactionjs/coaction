import { create as produce, current, isDraft } from 'mutative';
import { create } from '../src';
import { derivePath } from '../derived';
import { createReactiveTracker } from '../src/reactiveTracker';
import { produceLocalRoot } from '../src/rootDraft';
import { isSameStructure, markLocalState } from '../src/utils';

type Root = Record<PropertyKey, any>;

const visible = Symbol('visible');
const base = (): Root => ({
  count: 0,
  label: 'a',
  user: { name: 'Ada', tags: ['x'] },
  list: [{ id: 1 }, { id: 2 }]
});

const assigned = { name: 'assigned' };

// Each recipe runs on a fresh base through both producers.
const recipes: [string, (root: Root) => unknown][] = [
  ['nothing', () => {}],
  ['a scalar write', (root) => void (root.count = 1)],
  [
    'a write of the same value',
    (root) => {
      const count = root.count;
      root.count = count;
    }
  ],
  [
    'a write and its revert',
    (root) => {
      root.count = 1;
      root.count = 0;
    }
  ],
  [
    'several scalar writes',
    (root) => void ((root.count = 2), (root.label = 'b'))
  ],
  ['a nested write', (root) => void (root.user.name = 'Lin')],
  [
    'a scalar write, then a nested one',
    (root) => {
      root.count = 3;
      root.user.tags.push('y');
    }
  ],
  [
    'a nested write, then a scalar one',
    (root) => {
      root.list[1].id = 9;
      root.count = 4;
    }
  ],
  [
    'an object assigned, then written through',
    (root) => {
      root.user = assigned;
      root.user.name = 'changed';
    }
  ],
  [
    'an object assigned, then read',
    (root) => {
      root.user = assigned;
      return root.user.name;
    }
  ],
  ['a new key', (root) => void (root.extra = 1)],
  [
    'a key deleted and added back',
    (root) => {
      delete root.count;
      root.count = 5;
    }
  ],
  [
    'a scalar write, then listed keys',
    (root) => {
      root.label = 'c';
      return Object.keys(root).join();
    }
  ],
  [
    'a scalar write, then `in`',
    (root) => {
      root.count = 6;
      return 'count' in root && !('missing' in root);
    }
  ],
  [
    'a scalar write, then a serialization',
    (root) => {
      root.count = 7;
      return JSON.stringify(root);
    }
  ],
  ['a symbol key', (root) => void (root[visible] = 1)],
  [
    'a scalar write, then isDraft and current',
    (root) => {
      root.count = 8;
      return [isDraft(root), current(root).count];
    }
  ],
  [
    'an inherited read',
    (root) => [typeof root.toString, root.__proto__ === Object.prototype]
  ]
];

const runLocal = (recipe: (root: Root) => unknown) => {
  const before = base();
  let result: unknown;
  const [after, keysKept] = produceLocalRoot(before, (root) => {
    result = recipe(root);
  });
  return { before, after, result, keysKept };
};

const runMutative = (recipe: (root: Root) => unknown) => {
  const before = base();
  let result: unknown;
  const after = produce(
    before,
    (draft) => {
      result = recipe(draft as Root);
    },
    { mark: markLocalState }
  );
  return { before, after: after as Root, result };
};

test.each(recipes)('%s produces what a Mutative draft does', (_, recipe) => {
  const local = runLocal(recipe);
  const reference = runMutative(recipe);
  expect(local.result).toEqual(reference.result);
  expect(local.after === local.before).toBe(
    reference.after === reference.before
  );
  expect(isSameStructure(local.after, reference.after)).toBe(true);
  expect(Reflect.ownKeys(local.after)).toEqual(
    Reflect.ownKeys(reference.after)
  );
  for (const key of Reflect.ownKeys(reference.before)) {
    expect([key, local.after[key] === local.before[key]]).toEqual([
      key,
      reference.after[key] === reference.before[key]
    ]);
  }
  // An assigned object is kept, not drafted and copied.
  expect(local.after.user === assigned).toBe(reference.after.user === assigned);
  // Neither producer touches its base.
  expect(local.before).toEqual(base());
});

test('roots other than plain objects are drafted from the start', () => {
  const array = [1, 2, 3] as unknown as Root;
  const [nextArray] = produceLocalRoot(array, (root) => {
    root[0] = 4;
  });
  expect(nextArray).toEqual([4, 2, 3]);
  expect(array).toEqual([1, 2, 3]);
  const record = Object.assign(Object.create(null), { count: 0 }) as Root;
  const [nextRecord] = produceLocalRoot(record, (root) => {
    root.count = 1;
  });
  expect(Object.getPrototypeOf(nextRecord)).toBe(null);
  expect(nextRecord.count).toBe(1);
  expect(record.count).toBe(0);
});

test('a recipe that throws leaves its base alone and ends its drafts', () => {
  const before = base();
  let nested: Root | undefined;
  let held: Root | undefined;
  expect(() =>
    produceLocalRoot(before, (root) => {
      held = root;
      root.count = 1;
      nested = root.user;
      nested!.name = 'Lin';
      throw new Error('stop');
    })
  ).toThrow('stop');
  expect(before).toEqual(base());
  expect(() => nested!.name).toThrow(TypeError);
  expect(() => held!.count).toThrow(TypeError);
});

test('the root of a finished recipe is revoked', () => {
  let held: Root | undefined;
  produceLocalRoot(base(), (root) => {
    held = root;
    root.count = 1;
  });
  expect(() => held!.count).toThrow(TypeError);
});

const createCounterStore = () =>
  create((set) => ({
    count: 0,
    user: { name: 'Ada' },
    increment() {
      set(() => {
        this.count += 1;
      });
    },
    rename(name: string) {
      set(() => {
        this.user.name = name;
      });
    }
  }));

test('a root write notifies the readers of that key only', () => {
  const store = createCounterStore();
  const counts = createReactiveTracker();
  const names = createReactiveTracker();
  let countChanges = 0;
  let nameChanges = 0;
  counts.subscribe(() => countChanges++);
  names.subscribe(() => nameChanges++);
  counts.track(() => store.getState().count);
  names.track(() => store.getState().user.name);
  const before = store.getPureState();
  store.getState().increment();
  const after = store.getPureState();
  expect(after).not.toBe(before);
  expect(after.count).toBe(1);
  expect(after.user).toBe(before.user);
  expect(countChanges).toBe(1);
  expect(nameChanges).toBe(0);
  store.getState().rename('Lin');
  expect(nameChanges).toBe(1);
  expect(store.getState().user.name).toBe('Lin');
  counts.dispose();
  names.dispose();
  store.destroy();
});

test('getPureState and derivePath inside a recipe see its writes', () => {
  const store = create(() => ({ count: 0, user: { name: 'Ada' } }));
  // A tracked reader puts the store on the path without a patch journal.
  const tracker = createReactiveTracker();
  tracker.track(() => store.getState().count);
  const count = derivePath(store, ['count']);
  let seen: unknown[] = [];
  store.setState((state) => {
    state.count = 2;
    const pure = store.getPureState();
    seen = [pure.count, pure === store.getPureState(), count()];
    pure.user.name = 'Lin';
    pure.count = 3;
  });
  expect(seen).toEqual([2, true, 2]);
  expect(store.getPureState()).toEqual({ count: 3, user: { name: 'Lin' } });
  count.dispose();
  tracker.dispose();
  store.destroy();
});

test('a recipe returning an object, or throwing, keeps the store consistent', () => {
  const store = create(() => ({ count: 0, label: 'a' }));
  const tracker = createReactiveTracker();
  tracker.track(() => store.getState().count);
  store.setState((state) => {
    state.count = 1;
    return { label: 'b' } as never;
  });
  expect(store.getPureState()).toEqual({ count: 1, label: 'b' });
  const before = store.getPureState();
  expect(() =>
    store.setState((state) => {
      state.count = 5;
      throw new Error('stop');
    })
  ).toThrow('stop');
  expect(store.getPureState()).toBe(before);
  store.setState((state) => {
    state.count += 1;
  });
  expect(store.getPureState()).toEqual({ count: 2, label: 'b' });
  tracker.dispose();
  store.destroy();
});

test.each<[string, (root: Root) => unknown, boolean]>([
  ['nothing', () => {}, true],
  ['writes to its own keys', (root) => void (root.count = 1), true],
  [
    'a write and its revert',
    (root) => {
      root.count = 1;
      root.count = 0;
    },
    true
  ],
  ['a new key', (root) => void (root.extra = 1), false],
  ['a read of an object', (root) => void root.user.name, false],
  ['a deleted key', (root) => void delete root.count, false]
])('a root that saw %s reports whether it kept its keys', (_, recipe, kept) => {
  expect(runLocal(recipe).keysKept).toBe(kept);
});

test('a key the schema does not know is still refused', () => {
  const store = create(() => ({ count: 0 }));
  const tracker = createReactiveTracker();
  tracker.track(() => store.getState().count);
  const before = store.getPureState();
  expect(() =>
    store.setState(() => {
      (store.getPureState() as Root).extra = 1;
    })
  ).toThrow("Unknown state key 'extra'");
  expect(store.getPureState()).toBe(before);
  tracker.dispose();
  store.destroy();
});
