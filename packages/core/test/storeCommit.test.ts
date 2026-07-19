import { create, type Middleware, type Store } from '../src';
import {
  onStoreCommit,
  replayStorePatches,
  type StoreCommit
} from '../adapter';

type Counter = {
  count: number;
  increment: () => void;
  noop: () => void;
};

const createCounter = (
  middlewares: Middleware<Counter>[],
  enablePatches = false
) =>
  create<Counter>(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      noop() {
        set((draft) => {
          draft.count += 0;
        });
      }
    }),
    {
      enablePatches,
      middlewares
    }
  );

test('commit observers request exact patch pairs without enablePatches', () => {
  const commits: StoreCommit<Counter>[] = [];
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = createCounter([observe]);

  store.getState().increment();

  expect(commits).toHaveLength(1);
  expect(commits[0]).toMatchObject({
    source: 'setState',
    patches: [{ op: 'replace', path: ['count'], value: 1 }],
    inversePatches: [{ op: 'replace', path: ['count'], value: 0 }]
  });
  expect(commits[0].state).toBe(store.getPureState());

  store.getState().noop();
  expect(commits).toHaveLength(1);
});

test('commit observer cleanup is idempotent', () => {
  const listener = jest.fn();
  let unsubscribe = () => {};
  const observe: Middleware<Counter> = (store) => {
    unsubscribe = onStoreCommit(store, listener);
    return store;
  };
  const store = createCounter([observe]);

  unsubscribe();
  unsubscribe();
  store.getState().increment();

  expect(listener).not.toHaveBeenCalled();
});

test('replays patches through middleware and publishes the committed result', () => {
  const commits: StoreCommit<Counter>[] = [];
  const patch = jest.fn((transition: any) => transition);
  const patchMiddleware: Middleware<Counter> = (store) => {
    store.patch = patch;
    return store;
  };
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, (commit) => commits.push(commit));
    return store;
  };
  const store = createCounter([patchMiddleware, observe]);

  store.getState().increment();
  const increment = commits[0];
  patch.mockClear();

  const replayed = replayStorePatches(store, {
    patches: increment.inversePatches,
    inversePatches: increment.patches
  });

  expect(replayed).toBe(store.getPureState());
  expect(store.getState().count).toBe(0);
  expect(patch).toHaveBeenCalledTimes(1);
  expect(commits[commits.length - 1]).toMatchObject({
    source: 'replay',
    patches: [{ op: 'replace', path: ['count'], value: 0 }],
    inversePatches: [{ op: 'replace', path: ['count'], value: 1 }]
  });
});

test('replay does not expose retained patch objects to patch middleware', () => {
  let replaying = false;
  const patchMiddleware: Middleware<Counter> = (store) => {
    store.patch = (transition) => {
      if (replaying) {
        (transition.patches[0] as { value: number }).value = 7;
      }
      return transition;
    };
    return store;
  };
  let sourceStore: Store<Counter> | undefined;
  let increment: StoreCommit<Counter> | undefined;
  const observe: Middleware<Counter> = (store) => {
    sourceStore = store;
    onStoreCommit(store, (commit) => {
      if (commit.source === 'setState') {
        increment = commit;
      }
    });
    return store;
  };
  const store = createCounter([patchMiddleware, observe]);
  store.getState().increment();

  const retainedInverse = increment!.inversePatches;
  replaying = true;
  replayStorePatches(sourceStore!, {
    patches: retainedInverse,
    inversePatches: increment!.patches
  });

  expect(store.getState().count).toBe(7);
  expect((retainedInverse[0] as { value: number }).value).toBe(0);
});

test('rejected replay leaves state and commit stream unchanged', () => {
  const listener = jest.fn();
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, listener);
    return store;
  };
  const store = createCounter([observe]);

  expect(() =>
    replayStorePatches(store, {
      patches: [{ op: 'add', path: ['unknown'], value: 1 }],
      inversePatches: [{ op: 'remove', path: ['unknown'] }]
    })
  ).toThrow(/Unknown state key 'unknown'/);

  expect(store.getState().count).toBe(0);
  expect(listener).not.toHaveBeenCalled();
});

test('destroy releases commit observers and the patch replayer', () => {
  const listener = jest.fn();
  const observe: Middleware<Counter> = (store) => {
    onStoreCommit(store, listener);
    return store;
  };
  const store = createCounter([observe]);

  store.destroy();

  expect(() =>
    replayStorePatches(store, { patches: [], inversePatches: [] })
  ).toThrow('replayStorePatches() requires a store created by Coaction.');
  expect(listener).not.toHaveBeenCalled();
});
