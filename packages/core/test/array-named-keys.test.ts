import { vi } from 'vitest';
import { create } from '../src';
import { onStoreCommit, type StoreCommit } from '../src/storeCommit';

const tag = Symbol('tag');
const withExtras = (rows: { n: number }[]) =>
  Object.assign(rows, { meta: { label: 'kept' }, [tag]: 1 });

test.each([
  [
    'the initial state',
    () => create(() => ({ rows: withExtras([{ n: 1 }]) as { n: number }[] }))
  ],
  [
    'an object replacement',
    () => {
      const store = create(() => ({ rows: [] as { n: number }[] }));
      store.setState({ rows: withExtras([{ n: 1 }]) });
      return store;
    }
  ]
])('%s reads the same before and after a write', (_, make) => {
  const store = make();
  const keys = () => Reflect.ownKeys(store.getPureState().rows);
  expect(keys()).toEqual(['0', 'length']);
  expect('meta' in store.getState().rows).toBe(false);
  store.setState((draft) => {
    draft.rows[0].n = 2;
  });
  expect(keys()).toEqual(['0', 'length']);
  store.destroy();
});

test('a commit into an array that had named keys patches only what changed', () => {
  const store = create(() => ({
    rows: withExtras([{ n: 1 }]) as { n: number }[]
  }));
  const commits: StoreCommit[] = [];
  onStoreCommit(store, (commit) => commits.push(commit));
  store.setState((draft) => {
    draft.rows[0].n = 2;
  });
  expect(commits[0].patches).toEqual([
    { op: 'replace', path: ['rows', 0, 'n'], value: 2 }
  ]);
  store.destroy();
});

describe('the warning', () => {
  const environment = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = environment;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const importFresh = async () => {
    vi.resetModules();
    return (await import('../src')).create;
  };

  test('names the key, once, in development', async () => {
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const createFresh = await importFresh();
    createFresh(() => ({ a: withExtras([]), b: withExtras([]) }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("dropped the key 'meta'");
  });

  test('stays quiet for holes, hidden keys and outside development', async () => {
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const createFresh = await importFresh();
    const holey = new Array(2);
    holey[1] = 1;
    Object.defineProperty(holey, 'hidden', { value: 1 });
    createFresh(() => ({ holey }));
    process.env.NODE_ENV = 'production';
    createFresh(() => ({ rows: withExtras([]) }));
    expect(warn).not.toHaveBeenCalled();
  });
});
