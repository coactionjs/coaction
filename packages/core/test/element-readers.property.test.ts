import { create } from '../src';
import { createReactiveTracker } from '../src/reactiveTracker';
import { onStoreCommit } from '../src/storeCommit';
import { forEachSeed, type Random } from './random';

type Row = { n: number } | number | string | null | undefined;
type Data = { rows: Row[]; other: number };

const isObject = (row: Row): row is { n: number } =>
  typeof row === 'object' && row !== null;

const freshRow = (random: Random): Row =>
  random.pick([
    () => ({ n: random.integer(0, 9) }),
    () => Object.freeze({ n: random.integer(0, 9) }),
    () => random.pick([0, -0, NaN, 1.5, 7]),
    () => random.pick(['a', 'b']),
    () => random.pick([null, undefined])
  ])();

type Reader = {
  read: () => unknown;
  seen: unknown;
  notified: boolean;
  dispose: () => void;
};

/**
 * One reader per element, as the rows of a list are. A row is notified when
 * the element it read is no longer the same value -- `Object.is` -- and only
 * then: an element is handed out as itself, so its identity is what a row
 * depends on. With a commit listener every write takes the patch journal, which
 * may notify a row whose element only moved; it must still never miss one.
 *
 * Rows mount and unmount between writes, some read past the end of the array,
 * one reads its length, one a key arrays do not have, and a list scans the
 * array -- which freezes it, so the next write starts from a frozen array.
 */
test.each([
  ['no commit listener', false],
  ['a commit listener', true]
] as const)(
  'each row is notified exactly when its element changes, with %s',
  (_, watched) => {
    forEachSeed(watched ? 30 : 60, (random) => {
      const model: Row[] = random.list(16, random.chance(0.2) ? 160 : 72, () =>
        freshRow(random)
      );
      const store = create<Data>({ rows: [...model], other: 0 });
      if (watched) onStoreCommit(store, () => undefined);
      const readers = new Map<string, Reader>();
      const mount = (key: string, read: () => unknown) => {
        if (readers.has(key)) return;
        const tracker = createReactiveTracker();
        const reader: Reader = {
          read: () => tracker.track(read),
          seen: undefined,
          notified: false,
          dispose: () => tracker.dispose()
        };
        tracker.subscribe(() => {
          reader.notified = true;
        });
        reader.seen = reader.read();
        readers.set(key, reader);
      };
      const unmount = (key: string) => {
        readers.get(key)?.dispose();
        readers.delete(key);
      };
      const mountRow = (index: number) =>
        mount(String(index), () => store.getState().rows[index]);
      const current = (key: string) => {
        const { rows } = store.getPureState();
        if (key === 'list') return rows;
        if (key === 'length') return rows.length;
        if (key === 'extra') return undefined;
        return rows[Number(key)];
      };
      // Every element, or every second, third, fifth or seventh one: enough
      // rows for the elements to be compared, or too few for that to pay.
      const stride = random.pick([1, 1, 1, 2, 2, 3, 5, 7]);
      for (let index = 0; index < model.length + 4; index += stride) {
        mountRow(index);
      }
      mount('length', () => store.getState().rows.length);
      if (random.chance(0.3)) {
        mount('extra', () => (store.getState().rows as any).extra);
      }
      if (random.chance(0.5)) {
        mount('list', () => {
          store.getState().rows.includes(null);
          return store.getPureState().rows;
        });
      }
      try {
        for (let step = 0; step < 40; step++) {
          const kind = random.integer(0, 13);
          const at = random.integer(0, model.length + 1);
          const other = random.integer(0, model.length + 1);
          const value = freshRow(random);
          const count = random.integer(0, 3);
          const added = random.list(0, 2, () => freshRow(random));
          const length = random.integer(0, model.length);
          // The same edit, to the state and to a plain array kept beside it.
          const edit = (rows: Row[]) => {
            if (kind === 0) rows[at] = value;
            else if (kind === 1) {
              const row = rows[at];
              if (isObject(row)) row.n += 1;
              else rows[at] = { n: 1 };
            } else if (kind === 2) rows.push(value);
            else if (kind === 3) rows.pop();
            else if (kind === 4) rows.splice(at, count, ...added);
            else if (kind === 5) rows.reverse();
            else if (kind === 6) {
              if (at < rows.length && other < rows.length) {
                const held = rows[at];
                rows[at] = rows[other];
                rows[other] = held;
              }
            } else if (kind === 7) rows.length = length;
            else if (kind === 8) delete rows[at];
            else if (kind === 9) {
              if (at < rows.length) rows[at] = rows[other];
            } else if (kind === 10) rows.unshift(value);
          };
          if (kind === 11 || kind === 12) {
            // A new array of the state's own elements, one replaced or all
            // of them reversed.
            const replacement = [...store.getPureState().rows];
            if (kind === 11) replacement[at] = value;
            else replacement.reverse();
            store.setState({ rows: replacement });
            model.length = 0;
            model.push(...replacement);
          } else if (kind === 13) {
            store.setState((state) => {
              state.other += 1;
            });
          } else {
            store.setState((state) => {
              edit(state.rows);
            });
            // The model's objects are its own, so an edit inside one changes
            // only the index it was made at, as a draft's copy does.
            const copy = model.map((row) => (isObject(row) ? { ...row } : row));
            edit(copy);
            model.length = 0;
            model.push(...copy);
          }
          // The step travels with the rows, so a failure says which edit it was.
          expect({ step, kind, rows: store.getPureState().rows }).toEqual({
            step,
            kind,
            rows: model
          });
          expect(store.getPureState().rows).toHaveLength(model.length);
          for (const [key, reader] of readers) {
            const now = current(key);
            const changed = !Object.is(reader.seen, now);
            if (!reader.notified) {
              // Never a stale row.
              expect({ key, step, changed }).toEqual({
                key,
                step,
                changed: false
              });
              continue;
            }
            if (!watched) {
              // Never a row whose element is still the same value.
              expect({ key, step, changed }).toEqual({
                key,
                step,
                changed: true
              });
            }
            reader.notified = false;
            reader.seen = reader.read();
            expect(Object.is(reader.seen, now)).toBe(true);
          }
          // Rows unmount, and others mount, as a list scrolls.
          if (random.chance(0.3)) {
            for (const key of [...readers.keys()]) {
              if (/^\d+$/.test(key) && random.chance(0.3)) unmount(key);
            }
            const mounts = random.integer(0, 8);
            for (let i = 0; i < mounts; i++) {
              mountRow(random.integer(0, model.length + 1));
            }
          } else if (random.chance(0.05)) {
            // Most rows unmount at once, leaving too few to compare elements.
            for (const key of [...readers.keys()]) {
              if (/^\d+$/.test(key) && random.chance(0.9)) unmount(key);
            }
          }
        }
      } finally {
        readers.forEach((reader) => reader.dispose());
        store.destroy();
      }
    });
  },
  120000
);

const mountRows = (
  store: { getState: () => { rows: unknown } },
  keys: readonly string[],
  notified: string[]
) =>
  keys.map((key) => {
    const tracker = createReactiveTracker();
    tracker.subscribe(() => notified.push(key));
    tracker.track(() => (store.getState().rows as any)[key]);
    return tracker;
  });

const indexes = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index));

test('the reader of a named key on an array is notified when only that key changes', () => {
  // Numbers, so the replacement holds the same values. A recipe assigns the
  // array as it is; a draft cannot set a named key on one, and an object
  // replacement copies only the elements.
  const store = create<{ rows: unknown }>({
    rows: Array.from({ length: 32 }, (_, n) => n)
  });
  const notified: string[] = [];
  const trackers = mountRows(store, [...indexes(32), 'extra'], notified);
  store.setState((draft) => {
    draft.rows = Object.assign(
      Array.from({ length: 32 }, (_, n) => n),
      { extra: 1 }
    );
  });
  expect(notified).toEqual(['extra']);
  trackers.forEach((tracker) => tracker.dispose());
  store.destroy();
});

test('an array replaced by an object notifies the readers whose key changed', () => {
  const store = create<{ rows: unknown }>({
    rows: Array.from({ length: 32 }, (_, n) => n)
  });
  const notified: string[] = [];
  const trackers = mountRows(store, indexes(32), notified);
  store.setState({
    rows: Object.fromEntries(
      Array.from({ length: 32 }, (_, n) => [n, n === 4 ? -1 : n])
    )
  });
  expect(notified).toEqual(['4']);
  trackers.forEach((tracker) => tracker.dispose());
  store.destroy();
});
