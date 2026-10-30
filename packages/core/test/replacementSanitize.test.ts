import { create } from '../index';
import {
  applyPatches,
  onStoreCommit,
  sanitizeInitialStateValue,
  sanitizeReplacementState,
  type StoreCommit
} from 'coaction/adapter';

test.each([false, true])(
  'replacement preserves local array shape and input isolation (observed: %s)',
  (observed) => {
    const store = create<{ items: unknown[] }>(() => ({ items: [] }));
    const before = store.getPureState();
    const commits: StoreCommit[] = [];
    if (observed) onStoreCommit(store, (commit) => commits.push(commit));
    const symbol = Symbol('extra');
    const hidden = Symbol('hidden');
    const value = { count: 1 };
    const fn = () => 1;
    const input = new Array(4) as unknown[] & Record<PropertyKey, unknown>;
    Object.defineProperty(input, '0', { value, enumerable: false });
    input[2] = fn;
    input[symbol] = value;
    input.self = input;
    input.method = fn;
    Object.defineProperty(input, hidden, { value });
    Object.defineProperty(input, 'secret', { value });
    Object.defineProperty(input, '__proto__', {
      enumerable: true,
      get() {
        throw new Error('unsafe value read');
      }
    });
    store.setState({ items: input });
    const result = store.getPureState().items as typeof input;
    expect(result).toHaveLength(4);
    expect(1 in result).toBe(false);
    expect(3 in result).toBe(false);
    expect(result[0]).toEqual(value);
    expect(result[0]).not.toBe(value);
    expect(result[2]).toBe(fn);
    expect(result[symbol]).toBe(result[0]);
    expect(result.self).toBe(result);
    for (const key of ['method', 'secret', '__proto__', hidden]) {
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
    }
    value.count = 9;
    expect(result[0]).toEqual({ count: 1 });
    expect(Object.isFrozen(value)).toBe(false);
    if (observed) {
      expect(commits).toHaveLength(1);
      const replayed = applyPatches(before, commits[0].patches)
        .items as typeof input;
      expect(replayed[symbol]).toBe(replayed[0]);
      expect(replayed.self).toBe(replayed);
      expect(
        applyPatches(store.getPureState(), commits[0].inversePatches)
      ).toEqual(before);
    }
  }
);

test.each([
  ['a Map', () => new Map<object, unknown>()],
  ['a WeakMap', () => new WeakMap<object, unknown>()]
])(
  'an object copy keeps its own enumerable data, with %s as memo',
  (_, memo) => {
    const visible = Symbol('visible');
    const hidden = Symbol('hidden');
    const shared = { n: 1 };
    const method = () => 1;
    const input: Record<PropertyKey, unknown> = {
      b: shared,
      a: shared,
      method,
      [visible]: shared
    };
    input.self = input;
    Object.defineProperty(input, 'secret', { value: shared });
    Object.defineProperty(input, hidden, { value: shared });
    Object.defineProperty(input, '__proto__', {
      enumerable: true,
      get() {
        throw new Error('unsafe value read');
      }
    });
    Object.defineProperty(input, 'computed', {
      enumerable: true,
      get: () => ({ from: 'getter' })
    });
    const record = Object.assign(Object.create(null), { input });

    const initial = sanitizeInitialStateValue(record, memo());
    const copy = initial.input as Record<PropertyKey, unknown>;
    expect(Object.getPrototypeOf(initial)).toBe(null);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Reflect.ownKeys(copy)).toEqual([
      'b',
      'a',
      'method',
      'self',
      'computed',
      visible
    ]);
    expect(copy.b).toEqual({ n: 1 });
    expect(copy.b).not.toBe(shared);
    expect(copy.a).toBe(copy.b);
    expect(copy[visible]).toBe(copy.b);
    expect(copy.self).toBe(copy);
    expect(copy.method).toBe(method);
    expect(Object.getOwnPropertyDescriptor(copy, 'computed')).toEqual({
      value: { from: 'getter' },
      writable: true,
      enumerable: true,
      configurable: true
    });

    const replacement = sanitizeReplacementState(record, memo());
    expect(Reflect.ownKeys(replacement.input as object)).toEqual([
      'b',
      'a',
      'self',
      'computed',
      visible
    ]);
  }
);
