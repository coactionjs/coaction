import { create as createWithMutative } from 'mutative';
import { markLocalState } from './utils';

type Root = Record<PropertyKey, unknown>;

/** A recipe's root while it has only written values to its own keys. */
type RootDraft = {
  base: Root;
  copy: Root | undefined;
  /** The keys written to the copy, in order, for a draft taking over. */
  written: PropertyKey[] | undefined;
  draft: Root | undefined;
  finalize: (() => unknown) | undefined;
};

const hasOwn = Object.prototype.hasOwnProperty;
const draftOptions = { enablePatches: false, mark: markLocalState } as const;

/**
 * The Mutative draft, for everything a copy of the root cannot do: drafting
 * what lies below it, listing keys, deleting them. The writes made while the
 * root was a copy are replayed into it as the assignments they were, so it
 * holds exactly what it would hold had it been the root from the start -- an
 * object assigned to a key stays the object assigned, not a draft of it.
 */
const toDraft = (root: RootDraft): Root => {
  if (root.draft) return root.draft;
  const [draft, finalize] = createWithMutative(
    root.base,
    draftOptions
  ) as unknown as [Root, () => unknown];
  if (root.written) {
    for (const key of root.written) draft[key] = root.copy![key];
  }
  root.draft = draft;
  root.finalize = finalize;
  return draft;
};

const rootHandler: ProxyHandler<RootDraft> = {
  get(root, key) {
    if (root.draft || typeof key === 'symbol') return toDraft(root)[key];
    const value = (root.copy ?? root.base)[key];
    return typeof value === 'object' && value !== null
      ? toDraft(root)[key]
      : value;
  },
  set(root, key, value) {
    if (root.draft || typeof key === 'symbol') {
      toDraft(root)[key] = value;
      return true;
    }
    const source = root.copy ?? root.base;
    // A draft ignores a write of the value a key already holds, and so does
    // this: the root keeps its identity.
    if (Object.is(source[key], value) && hasOwn.call(source, key)) return true;
    root.copy ??= { ...root.base };
    root.copy[key] = value;
    (root.written ??= []).push(key);
    return true;
  },
  has: (root, key) => Reflect.has(toDraft(root), key),
  ownKeys: (root) => Reflect.ownKeys(toDraft(root)),
  getOwnPropertyDescriptor: (root, key) =>
    Reflect.getOwnPropertyDescriptor(toDraft(root), key),
  defineProperty: (root, key, descriptor) =>
    Reflect.defineProperty(toDraft(root), key, descriptor),
  deleteProperty: (root, key) => Reflect.deleteProperty(toDraft(root), key),
  getPrototypeOf: (root) => Object.getPrototypeOf(root.base),
  setPrototypeOf: (root, prototype) =>
    Reflect.setPrototypeOf(toDraft(root), prototype)
};

/**
 * Produce the next root of a recipe that needs no patch pair.
 *
 * Creating and finalizing a Mutative draft is most of the cost of a write that
 * only sets a value on the root -- `count += 1` -- so the recipe starts on a
 * plain copy of the root instead. Writes of values to the root's own keys copy
 * it once and touch nothing else; anything more hands the root to a Mutative
 * draft, which every later access goes through. A root with a prototype other
 * than `Object.prototype` is drafted from the start.
 */
export const produceLocalRoot = <T extends object>(
  base: T,
  recipe: (root: T) => void
): T => {
  if (Object.getPrototypeOf(base) !== Object.prototype) {
    return createWithMutative(base, recipe, draftOptions) as T;
  }
  const root: RootDraft = {
    base: base as Root,
    copy: undefined,
    written: undefined,
    draft: undefined,
    finalize: undefined
  };
  const { proxy, revoke } = Proxy.revocable(root, rootHandler);
  let finished = false;
  try {
    recipe(proxy as unknown as T);
    finished = true;
    return (root.finalize?.() ?? root.copy ?? root.base) as T;
  } finally {
    // A recipe that throws ends its drafts as a failed producer does.
    if (!finished && root.finalize) {
      try {
        root.finalize();
      } catch {
        // The recipe's own error is the one reported.
      }
    }
    revoke();
  }
};
