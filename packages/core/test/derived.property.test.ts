import { derive, derivePath } from 'coaction/derived';
import { onStoreCommit, replayStorePatches } from 'coaction/adapter';
import { createStore } from '../src/storeFactory';
import { forEachSeed } from './random';

type Data = {
  rows: Array<{ n: number; label: string }>;
  selected: number;
  dict: Record<string, number>;
};
const project = (s: Data) =>
  `${s.rows[s.selected]?.n}:${s.rows.length}:${s.rows.reduce((sum, row) => sum + row.n, 0)}:${Object.keys(s.dict).join(',')}:${'x' in s.dict}:${s.dict.x}`;

// A commit listener needs the patch pair, so with one every local write goes
// through the patch journal. Without one -- the store of most applications --
// a write takes the patch-free path instead: a recipe that only sets values on
// the root's own keys runs on a copy of the root until it reaches below it, and
// readers are notified by comparing the paths they observed. Both have to give
// every reader what a fresh evaluation gives.
test.each([
  ['a commit listener', true],
  ['no commit listener', false]
] as const)(
  'cached derived values equal fresh evaluation across mixed writes and rollbacks, with %s',
  (_, watched) => {
    forEachSeed(40, (random) => {
      let expected: Data = {
        rows: [
          { n: 1, label: 'a' },
          { n: 2, label: 'b' }
        ],
        selected: 0,
        dict: {}
      };
      const { store, internal } = createStore(structuredClone(expected), {});
      const deep = derive(store, project, { deep: true });
      const conservative = derive(store, project);
      const path = derivePath(store, ['rows', 0, 'n']);
      const row = derive(
        store,
        (s) => ({ row: s.rows[s.selected], label: s.rows[s.selected]?.label }),
        { deep: true }
      );
      let commits = 0;
      if (watched) {
        onStoreCommit(store, () => {
          commits++;
        });
      }
      try {
        for (let step = 0; step < 50; step++) {
          const check = () => {
            expect(deep()).toBe(project(expected));
            expect(conservative()).toBe(project(expected));
            expect(path()).toBe(expected.rows[0]?.n);
            expect(row().row).toBe(store.getState().rows[expected.selected]);
            expect(row().row?.n).toBe(expected.rows[expected.selected]?.n);
            expect(store.getPureState()).toEqual(expected);
            // An element is handed out as the frozen value the store holds.
            const first = store.getState().rows[0];
            if (first) {
              expect(Object.isFrozen(first)).toBe(true);
              expect(first).toBe(store.getPureState().rows[0]);
            }
          };
          check();
          const before = structuredClone(expected);
          const value = random.integer(-20, 20);
          const kind = random.integer(0, 10);
          const recipe = (s: Data) => {
            if (kind === 0 && s.rows.length) s.rows[0].n = value;
            else if (kind === 1) s.rows.reverse();
            else if (kind === 2)
              s.rows.splice(0, 1, { n: value, label: 'new' });
            else if (kind === 3) s.rows.length = Math.min(s.rows.length, 1);
            else if (kind === 4) {
              const captured = s.rows[1];
              s.rows.unshift({ n: value, label: 'head' });
              if (captured) captured.n = value + 1;
            } else if (kind === 5) {
              // `y` is listed but never read as a value, so a reader learns
              // that it came or went only from the keys of `dict`.
              const key = value % 2 ? 'x' : 'y';
              if (key in s.dict) delete s.dict[key];
              else s.dict[key] = value;
            } else if (kind === 6) s.selected = Math.abs(value) % 4;
            else if (kind === 7) {
              // Read back a root key written on the copy, then reach below
              // the root: the draft taking over has to replay that write.
              s.selected = Math.abs(value) % 4;
              const index = s.selected;
              const target = s.rows[index];
              if (target) target.n = value;
            } else if (kind === 8) {
              // Objects assigned to root keys before any draft exists.
              s.dict = value > 0 ? { x: value } : {};
            } else if (kind === 9) {
              s.rows = value > 0 ? [{ n: value, label: 'fresh' }] : [];
            } else {
              // The value a key already holds keeps the root as it is.
              const { selected } = s;
              s.selected = selected;
            }
          };
          recipe(expected);
          if (step % 7 === 0) {
            const count = commits;
            expect(() =>
              store.setState((s) => {
                recipe(s);
                expect(deep()).toBe(project(expected));
                throw new Error('rollback');
              })
            ).toThrow('rollback');
            expected = before;
            expect(commits).toBe(count);
          } else if (step % 4 === 0) store.setState(recipe);
          else if (step % 4 === 1) store.setState(structuredClone(expected));
          else if (step % 4 === 2)
            store.apply(store.getPureState(), [
              { op: 'replace', path: [], value: structuredClone(expected) }
            ]);
          else
            replayStorePatches(store, {
              patches: [
                { op: 'replace', path: [], value: structuredClone(expected) }
              ],
              inversePatches: [{ op: 'replace', path: [], value: before }]
            });
          check();
        }
      } finally {
        deep.dispose();
        conservative.dispose();
        path.dispose();
        row.dispose();
        expect(internal.reactivePathActiveCount).toBe(0);
        store.destroy();
      }
    });
  },
  600000
);
