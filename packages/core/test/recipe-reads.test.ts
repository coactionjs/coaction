import { create as produce } from 'mutative';
import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';
import { onStoreCommit, type StoreCommit } from '../src/storeCommit';
import {
  applyPatches,
  completeProducerPatches,
  createRecordingMark,
  isSameStructure,
  type RecipeReads
} from '../src/utils';

type Rows = { rows: { n: number }[] };

const record = <T extends object>(base: T, recipe: (draft: T) => void) => {
  const reads: RecipeReads = [];
  const [after, patches, inversePatches] = produce(base, recipe, {
    enablePatches: true,
    mark: createRecordingMark(reads)
  });
  return { after, patches, inversePatches, reads };
};

const base = (): Rows => ({ rows: [{ n: 1 }, { n: 1 }, { n: 1 }] });

test('a write that read only its own path keeps its single patch', () => {
  const before = base();
  const { after, patches, inversePatches, reads } = record(before, (draft) => {
    draft.rows[2].n = 5;
  });
  const pair = completeProducerPatches(
    before,
    after,
    patches,
    inversePatches,
    false,
    reads
  );
  expect(pair.patches).toEqual([
    { op: 'replace', path: ['rows', 2, 'n'], value: 5 }
  ]);
  expect(pair.inversePatches).toEqual([
    { op: 'replace', path: ['rows', 2, 'n'], value: 1 }
  ]);
});

test('a write that reads its own path again keeps its single patch', () => {
  const before = base();
  const { after, patches, inversePatches, reads } = record(before, (draft) => {
    draft.rows[2].n = draft.rows[2].n + 4;
  });
  // The second read hands the recipe drafts, which are revoked by the time the
  // record is checked.
  const pair = completeProducerPatches(
    before,
    after,
    patches,
    inversePatches,
    false,
    reads
  );
  expect(pair.patches).toEqual([
    { op: 'replace', path: ['rows', 2, 'n'], value: 5 }
  ]);
  expect(pair.inversePatches).toEqual([
    { op: 'replace', path: ['rows', 2, 'n'], value: 1 }
  ]);
});

type Loose = Record<string, any>;

test.each<
  [string, () => Loose, (draft: Loose) => void, (state: Loose) => string[]]
>([
  [
    'an object on the path',
    () => ({
      rows: [
        { k: 1, n: 1 },
        { k: 1, n: 1 }
      ]
    }),
    (draft) => {
      delete draft.rows[1].k;
      draft.rows[1].k = 1;
      draft.rows[1].n = 5;
    },
    (state) => Object.keys(state.rows[1])
  ],
  [
    'the root',
    () => ({ k: 1, rows: [{ n: 1 }] }),
    (draft) => {
      delete draft.k;
      draft.k = 1;
      draft.rows[0].n = 5;
    },
    (state) => Object.keys(state)
  ]
])(
  'keys reordered on %s without a read fail the single patch',
  (_, initial, recipe, keysOf) => {
    const before = initial();
    const { after, patches, inversePatches, reads } = record(before, recipe);
    expect(keysOf(after)).not.toEqual(keysOf(before));
    expect(patches).toHaveLength(1);
    const pair = completeProducerPatches(
      before,
      after,
      patches,
      inversePatches,
      false,
      reads
    );
    expect(pair.patches).not.toEqual(patches);
    expect(isSameStructure(applyPatches(before, pair.patches), after)).toBe(
      true
    );
  }
);

test('a sibling copy behind a write is caught from the reads that made it', () => {
  const before = base();
  const { after, patches, inversePatches, reads } = record(before, (draft) => {
    draft.rows[1].n++;
    draft.rows[1].n--;
    draft.rows[2].n = 5;
  });
  // The reverted write still copied the sibling, and reported nothing.
  expect(after.rows[1]).not.toBe(before.rows[1]);
  expect(patches).toHaveLength(1);
  // Reading the sibling is what recorded it, and a record that misses the
  // written path proves nothing: both keep the sibling comparison.
  for (const seen of [reads, [before]]) {
    const pair = completeProducerPatches(
      before,
      after,
      patches,
      inversePatches,
      false,
      seen
    );
    expect(pair.patches).not.toEqual(patches);
    expect(isSameStructure(applyPatches(before, pair.patches), after)).toBe(
      true
    );
  }
});

test.each([
  [
    'a reverted write',
    (state: Rows) => {
      state.rows[1].n++;
      state.rows[1].n--;
    }
  ],
  [
    'an element moved out and back',
    (state: Rows) => {
      const [moved] = state.rows.splice(1, 1);
      moved.n++;
      moved.n--;
      state.rows.splice(1, 0, moved);
    }
  ]
] as const)(
  'a reader of a sibling copied by %s hears about the copy',
  (_, copy) => {
    const store = create({ rows: [{ n: 1 }, { n: 1 }, { n: 1 }] });
    const commits: StoreCommit[] = [];
    const stop = onStoreCommit(store, (commit) => {
      commits.push(commit);
    });
    const tracker = createReactiveTracker();
    let notifications = 0;
    tracker.subscribe(() => notifications++);
    tracker.track(() => store.getState().rows[1]);
    const before = store.getPureState();
    store.setState((state) => {
      copy(state);
      state.rows[2].n = 5;
    });
    const after = store.getPureState();
    expect(after.rows[1]).not.toBe(before.rows[1]);
    expect(notifications).toBe(1);
    expect(tracker.track(() => store.getState().rows[1])).toBe(after.rows[1]);
    expect(commits).toHaveLength(1);
    expect(
      isSameStructure(applyPatches(before, commits[0].patches), after)
    ).toBe(true);
    tracker.dispose();
    stop();
    store.destroy();
  }
);
