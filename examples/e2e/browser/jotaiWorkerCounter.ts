import {
  adapt,
  atom,
  bindJotai,
  createStore
} from '../../../packages/coaction-jotai/src/index';

export type JotaiWorkerCounterState = {
  count: number;
  add: (step?: number) => number;
  addAsync: (step?: number) => Promise<number>;
  fail: (message?: string) => never;
};

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// jotai's own store + atom are the "underlying library" handle here, kept
// separate from coaction's own snapshot, mirroring the subpackage example's
// pattern (createStore()/atom() live outside the coaction factory closure).
export const createJotaiWorkerCounter = () => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const factory = () =>
    adapt<JotaiWorkerCounterState>(
      bindJotai({
        store: jotaiStore,
        atoms: { count: countAtom },
        actions: ({ store, atoms }: any) => ({
          add(step = 1) {
            store.set(atoms.count, store.get(atoms.count) + step);
            return store.get(atoms.count);
          },
          async addAsync(step = 1) {
            store.set(atoms.count, store.get(atoms.count) + step);
            await wait(20);
            store.set(atoms.count, store.get(atoms.count) + step);
            return store.get(atoms.count);
          },
          fail(message = 'jotai worker exploded') {
            throw new Error(message);
          }
        })
      })
    );
  return {
    factory,
    jotaiStore,
    countAtom
  };
};
