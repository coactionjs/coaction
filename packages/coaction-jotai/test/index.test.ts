import { create, Slices } from 'coaction';
import { vi } from 'vitest';
import { adapt, atom, bindJotai, createStore } from '../src';

test('base', () => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom
          },
          actions: ({ store, atoms }) => ({
            increment() {
              store.set(atoms.count, store.get(atoms.count) + 1);
            }
          })
        })
      ),
    {
      name: 'test'
    }
  );
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
}
`);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(1);
  expect(jotaiStore.get(countAtom)).toBe(1);
  jotaiStore.set(countAtom, 5);
  expect(useStore.getState().count).toBe(5);
  useStore.setState({
    count: 8
  });
  expect(jotaiStore.get(countAtom)).toBe(8);
});

test('destroy unsubscribes atom listeners', () => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom
          }
        })
      ),
    {
      name: 'test-destroy'
    }
  );
  expect(useStore.getState().count).toBe(0);
  useStore.destroy();
  jotaiStore.set(countAtom, 10);
  expect(useStore.getState().count).toBe(0);
});

test('destroy unsubscribes atom listeners only once', () => {
  const countAtom = atom(0);
  const unsubscribe = vi.fn(() => {
    if (unsubscribe.mock.calls.length > 1) {
      throw new Error('unsubscribe called twice');
    }
  });
  const jotaiStore = {
    get: vi.fn(() => 0),
    set: vi.fn(),
    sub: vi.fn(() => unsubscribe)
  };
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore as any,
          atoms: {
            count: countAtom
          }
        })
      ),
    {
      name: 'test-destroy-once'
    }
  );

  useStore.destroy();
  expect(() => useStore.destroy()).not.toThrow();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('ignores non-atom keys when syncing from coaction to jotai', () => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom
          }
        })
      ),
    {
      name: 'test-ignore-non-atom'
    }
  );
  useStore.apply({
    other: 123
  } as any);
  expect(jotaiStore.get(countAtom)).toBe(0);
});

test('supports symbol atom keys', () => {
  const token = Symbol('jotai-token');
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            [token]: countAtom
          } as any
        })
      ),
    {
      name: 'test-symbol-atom'
    }
  );

  expect((useStore.getState() as any)[token]).toBe(0);
  useStore.setState({
    [token]: 5
  } as any);
  expect(jotaiStore.get(countAtom)).toBe(5);
});

test('ignores unsafe atom and action keys', () => {
  const protoKey = '__proto__';
  const countAtom = atom(0);
  const unsafeAtom = atom({
    polluted: true
  });
  const constructorAtom = atom(1);
  const jotaiStore = createStore();
  const useStore = create(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom,
            [protoKey]: unsafeAtom,
            constructor: constructorAtom
          } as any,
          actions: () =>
            ({
              [protoKey]: () => undefined,
              prototype: () => undefined
            }) as any
        })
      ),
    {
      name: 'test-unsafe-atom-keys'
    }
  );

  expect(useStore.getState().count).toBe(0);
  expect(Object.getPrototypeOf(useStore.getPureState())).toBe(Object.prototype);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), protoKey)
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), 'constructor')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), 'prototype')
  ).toBe(false);
});

describe('Slices', () => {
  test('base - unsupported', () => {
    const countAtom = atom(0);
    const jotaiStore = createStore();
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              increment: () => void;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () =>
            adapt(
              bindJotai({
                store: jotaiStore,
                atoms: {
                  count: countAtom
                },
                actions: ({ store, atoms }) => ({
                  increment() {
                    store.set(atoms.count, store.get(atoms.count) + 1);
                  }
                })
              })
            )
        },
        {
          name: 'test',
          sliceMode: 'slices'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
