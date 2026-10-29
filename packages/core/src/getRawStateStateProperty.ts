import { Computed, createCachedGetter } from './computed';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import {
  elementSnapshots,
  getImmutableStateSnapshot,
  indexImmutableStateSnapshot,
  isImmutableStateObject
} from './immutableState';
import { sharedRegistry } from './sharedRegistry';
import { isArrayIndexKey, sanitizeInitialStateValue } from './utils';
import {
  getReactivePathNode,
  getReactivePathVersion,
  isReactiveTrackingActive,
  trackReactiveChild,
  trackReactiveNode,
  trackReactivePath,
  trackReactiveStructureNode,
  trackReactiveTraversalNode,
  type ReactivePath,
  type ReactivePathNode
} from './reactivePath';

// A readonly value keeps one proxy per source object so aliased and circular
// references stay identical through the public state, which means a single
// proxy can be reachable at more than one path. Every path it is reached at is
// recorded, and reads track all of them: the proxy cannot tell which path the
// caller traversed, so tracking the union is the only choice that never misses
// an update. Aliasing is rare, so the extra notifications it can cause are too.
type ReactivePathMeta = {
  internal: Internal<any>;
  paths: ReactivePath[];
  /** The trie node of each path, resolved on first tracked use. */
  nodes?: (ReactivePathNode | undefined)[];
};

// Shared across entry points: a value created by `coaction` is read
// through `coaction/adapter`, and a per-bundle map would not recognise it.
const publicStatePathMeta = sharedRegistry.publicStatePathMeta as WeakMap<
  object,
  ReactivePathMeta
>;
/** Reverse of the readonly proxy cache, so a proxy can hand back its source. */
const readonlyProxySource = sharedRegistry.readonlyProxySource;
/**
 * Every object the state has frozen to hand out as itself. Such a value is a
 * state value without a proxy, so carrying it out of a selector is tracked by
 * identity -- and an object frozen by anyone else is plain data to traverse.
 */
const stateValues = sharedRegistry.stateValues;

/**
 * The trie node a recorded path is tracked at. Holding it on the meta is what
 * keeps a tracked read from building a path array and walking the trie from
 * the root; a node that has since been pruned is resolved again.
 */
const metaNode = (meta: ReactivePathMeta, index: number) => {
  const nodes = (meta.nodes ??= []);
  let node = nodes[index];
  if (node === undefined || node.pruned) {
    node = nodes[index] = getReactivePathNode(meta.internal, meta.paths[index]);
  }
  return node;
};

const isReactivePathPrefix = (left: ReactivePath, right: ReactivePath) => {
  if (left.length > right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
};

const addReactivePathTo = (
  meta: ReactivePathMeta,
  path: ReactivePath,
  owned: boolean
) => {
  // Stored paths form an antichain: none contains another. Remove descendants
  // in place, preserving the union of aliases without allocating on every read.
  for (let index = meta.paths.length - 1; index >= 0; index--) {
    const known = meta.paths[index];
    if (isReactivePathPrefix(known, path)) return;
    if (isReactivePathPrefix(path, known)) meta.paths.splice(index, 1);
  }
  meta.paths.push(owned ? path : [...path]);
  meta.nodes = undefined;
};

const mergeReadonlyStateValuePaths = <T extends CreateState>(
  value: object,
  internal: Internal<T>,
  paths: readonly ReactivePath[] | undefined,
  owned = false
) => {
  if (!paths?.length) {
    return;
  }
  let meta = publicStatePathMeta.get(value);
  if (!meta) {
    meta = { internal, paths: [] };
    publicStatePathMeta.set(value, meta);
  } else if (meta.internal !== internal) {
    return;
  }
  for (const path of paths) {
    addReactivePathTo(meta, path, owned);
  }
};

/** @internal Register frozen public store/slice facades as terminal paths. */
export const registerReadonlyStateValuePath = <T extends CreateState>(
  value: object,
  internal: Internal<T>,
  path: ReactivePath
) => {
  mergeReadonlyStateValuePaths(value, internal, [path]);
};

/**
 * Mark an object-valued selector result as a terminal reactive dependency.
 * Framework adapters call this while their tracker is active so returning a
 * readonly state object is reactive even when the selector does not read a
 * primitive child.
 *
 * Returns whether the value is state. A value the state hands out as itself --
 * an array element -- is, and has nothing further to track: reading it took
 * the dependency on its identity.
 */
export const trackReadonlyStateValue = (value: unknown) => {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value) {
    return false;
  }
  const meta = publicStatePathMeta.get(value as object);
  if (!meta) {
    return stateValues.has(value as object);
  }
  if (isReactiveTrackingActive()) {
    for (let index = 0; index < meta.paths.length; index++) {
      trackReactiveNode(metaNode(meta, index));
    }
  }
  return true;
};

/**
 * Semantic version for a public readonly state facade/proxy. Summing the
 * per-path versions keeps the result strictly increasing when any path the
 * value is reachable at changes, which is all callers compare it for.
 *
 * Part of the published `coaction/adapter` surface, so it must not be tagged
 * as internal: `stripInternal` would drop the declaration from the emitted
 * types and leave the adapter entry re-exporting a name that is not there.
 */
export const getReadonlyStateValueVersion = (value: unknown) => {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value) {
    return undefined;
  }
  const meta = publicStatePathMeta.get(value as object);
  if (!meta) {
    // A value handed out as itself never changes: its identity is the version.
    return stateValues.has(value as object) ? 0 : undefined;
  }
  let version = 0;
  for (const path of meta.paths) {
    version += getReactivePathVersion(meta.internal, path);
  }
  return version;
};

/**
 * Depend on a value as a whole, and read it as a plain object.
 *
 * Reading a collection through the public state records one dependency per
 * element touched, which is what makes an unrelated sibling write cheap. When a
 * selector scans the whole collection that precision buys nothing -- any change
 * to it invalidates the scan anyway -- and every element read pays for a proxy
 * trap. Array methods such as `filter` or `reduce` already scan this way.
 * `whole()` does the same for any other traversal: it records a single
 * dependency on the value and returns the underlying object, so the scan runs
 * at plain-object speed:
 *
 * ```ts
 * const total = useStore((state) => sum(whole(state.items)));
 * ```
 *
 * The selector re-runs when anything inside `items` changes, and not otherwise.
 *
 * The returned object is the store's own data, exactly as `getPureState()`
 * returns it. Read it; never mutate it -- writes belong in `set()`, and a
 * mutation here corrupts the store without going through a transaction.
 *
 * Values that did not come from a Coaction store are returned unchanged. A
 * value from a store built by a *different* entry point is not one of them:
 * `coaction` and `coaction/shared` are separate bundles, but the registry
 * behind this lives in the global symbol registry, so either entry's `whole`
 * recognises either entry's state. `check-entry-runtime-interop.mjs` asserts
 * that against the built output, where it can actually be observed.
 */
export const whole = <T>(value: T): T => {
  return (
    trackReadonlyStateValue(value)
      ? (readonlyProxySource.get(value as object) ?? value)
      : value
  ) as T;
};

type PrepareStateDescriptorOptions<T extends CreateState> = {
  descriptor: PropertyDescriptor;
  internal: Internal<T>;
  initialStateSeen: WeakMap<object, unknown>;
  key: PropertyKey;
  rawState: Record<PropertyKey, any>;
  sliceKey?: PropertyKey;
};

const assertImmutableStateMutationAllowed = <T extends CreateState>(
  internal: Internal<T>
) => {
  if (internal.mutableInstance || internal.isBatching) {
    return;
  }
  throw new Error(
    'Direct state mutation is not allowed in immutable Coaction stores. Wrap mutations in set(() => { ... }).'
  );
};

/**
 * Whether reads hand values inside arrays out as themselves. Adapter-backed
 * stores read another runtime's objects, which are not Coaction's to freeze,
 * and drafts and getter snapshots have their own read paths.
 */
const exposesStateValues = <T extends CreateState>(internal: Internal<T>) =>
  !internal.mutableInstance &&
  !internal.updateImmutable &&
  !internal.externalApply &&
  !internal.isBatching &&
  !internal.computedReadDepth;

/**
 * Freeze a state value before it leaves the store as itself. A value is frozen
 * with everything below it, so a frozen state object needs no second visit and
 * a stray write fails as loudly as a write through a readonly proxy does.
 * Commits never edit a value in place -- a write copies the path it changes --
 * so freezing what is handed out costs only the first read of each value.
 */
const freezeStateValue = <V>(value: V): V => {
  if (Object.isFrozen(value) || !isImmutableStateObject(value)) return value;
  const pending: object[] = [value];
  const queue = (child: unknown) => {
    if (
      typeof child === 'object' &&
      child !== null &&
      !Object.isFrozen(child) &&
      isImmutableStateObject(child)
    ) {
      pending.push(child);
    }
  };
  while (pending.length) {
    const current = pending.pop() as Record<PropertyKey, unknown>;
    // A shared object can be queued twice before it is first reached.
    if (Object.isFrozen(current)) continue;
    Object.freeze(current);
    stateValues.add(current);
    // An array's values are its elements; listing its keys would allocate one
    // per element each time a write hands the scan a fresh copy. Its named
    // extras are state too: they follow the indexes in `Object.keys`, which
    // lists an array's keys several times faster than `Reflect.ownKeys`.
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        queue(current[index]);
      }
      const keys = Object.keys(current);
      for (
        let index = keys.length - 1;
        index >= 0 && !isArrayIndexKey(keys[index]);
        index -= 1
      ) {
        queue(current[keys[index]]);
      }
      for (const symbol of Object.getOwnPropertySymbols(current)) {
        queue(current[symbol]);
      }
    } else {
      for (const key of Reflect.ownKeys(current)) queue(current[key]);
    }
  }
  return value;
};

/**
 * Array methods that read every element and change nothing. Through the public
 * state each of them takes one dependency on the whole array -- what `whole()`
 * registers -- and runs over the array itself: the elements are values anyway,
 * and a scan depends on all of them, so a proxy trap and a dependency per
 * element read would only make it slower. Reads of other state inside a
 * callback are tracked as usual.
 */
const scanMethods = new Set<PropertyKey>([
  'at',
  'concat',
  'entries',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'reduce',
  'reduceRight',
  'slice',
  'some',
  'toLocaleString',
  'toReversed',
  'toSorted',
  'toSpliced',
  'toString',
  'values',
  'with',
  Symbol.iterator
]);

// Key the cache by the immutable source object so obsolete snapshots and their
// dynamic dictionary paths can be reclaimed together, and so one source object
// keeps one proxy no matter how many paths reach it.
const readonlyProxyCache = sharedRegistry.readonlyProxyCache as WeakMap<
  Internal<any>,
  WeakMap<object, object>
>;

const getReadonlyProxyCache = <T extends CreateState>(
  internal: Internal<T>
) => {
  let byValue = readonlyProxyCache.get(internal);
  if (!byValue) {
    byValue = new WeakMap<object, object>();
    readonlyProxyCache.set(internal, byValue);
  }
  return byValue;
};

const getPublicStateObject = <T extends CreateState>(
  internal: Internal<T>,
  value: object,
  sliceKey?: PropertyKey
) => {
  if (value === internal.rootState) {
    return internal.module;
  }
  if (
    typeof sliceKey === 'undefined' ||
    typeof internal.rootState !== 'object' ||
    internal.rootState === null ||
    typeof internal.module !== 'object' ||
    internal.module === null
  ) {
    return undefined;
  }
  const rootState = internal.rootState as Record<PropertyKey, unknown>;
  const module = internal.module as Record<PropertyKey, unknown>;
  if (rootState[sliceKey] === value) {
    return module[sliceKey];
  }
  return undefined;
};

const toReadonlyStateValue = <T extends CreateState>(
  internal: Internal<T>,
  value: unknown,
  sliceKey?: PropertyKey,
  paths?: readonly ReactivePath[]
): unknown => {
  if (
    internal.mutableInstance ||
    internal.isBatching ||
    !isImmutableStateObject(value)
  ) {
    return value;
  }
  if (internal.computedReadDepth) {
    for (const path of paths ?? []) {
      if (path.length) {
        trackReactivePath(internal, path);
      }
    }
    const cache = (internal.computedSnapshotCache ??= new WeakMap());
    if (
      isImmutableStateObject(internal.rootState) &&
      !cache.has(internal.rootState)
    ) {
      getImmutableStateSnapshot(internal.rootState, cache);
    }
    return getImmutableStateSnapshot(value, cache);
  }
  const publicValue = getPublicStateObject(internal, value, sliceKey);
  if (publicValue) {
    return publicValue;
  }
  // A value reached through an object key stays a readonly proxy even once it
  // is frozen -- a scan freezes the array it runs over -- so its identity does
  // not depend on what read it before, and reads through it stay precise.
  const cache = getReadonlyProxyCache(internal);
  const cached = cache.get(value as object);
  if (cached) {
    mergeReadonlyStateValuePaths(cached, internal, paths, true);
    return cached;
  }
  // The proxy holds its own meta rather than looking it up per property read.
  // The array is read at trap time, not captured, because a proxy can still
  // pick up further paths later when an alias of the same object is traversed.
  const meta: ReactivePathMeta = { internal, paths: [] };
  let scans: Map<PropertyKey, Function> | undefined;
  const getScan = (target: unknown[], key: PropertyKey, method: Function) => {
    let scan = scans?.get(key);
    if (!scan) {
      const searches =
        key === 'includes' || key === 'indexOf' || key === 'lastIndexOf';
      scan = function (this: unknown, ...args: unknown[]) {
        if (this !== proxy || !exposesStateValues(internal)) {
          return method.apply(this, args);
        }
        if (isReactiveTrackingActive()) {
          for (let index = 0; index < meta.paths.length; index++) {
            trackReactiveNode(metaNode(meta, index));
          }
        }
        // An element searched for may be an alias reached through an object
        // key, which is its readonly proxy. Any other argument stays as given:
        // `concat` reads an array proxy through its traps, which hand the
        // elements out frozen, where its source would hand them out raw.
        if (searches && typeof args[0] === 'object' && args[0] !== null) {
          args[0] = readonlyProxySource.get(args[0]) ?? args[0];
        }
        return method.apply(freezeStateValue(target), args);
      };
      (scans ??= new Map()).set(key, scan);
    }
    return scan;
  };
  const rejectMutation = () => {
    assertImmutableStateMutationAllowed(internal);
    return false;
  };
  const proxy: object = new Proxy(value as Record<PropertyKey, unknown>, {
    get(target, key, receiver) {
      const nextValue = Reflect.get(target, key, receiver);
      const isStateObject = isImmutableStateObject(nextValue);
      const isOwn = Object.prototype.hasOwnProperty.call(target, key);
      if (
        typeof nextValue === 'function' &&
        !isOwn &&
        Array.isArray(target) &&
        scanMethods.has(key)
      ) {
        return getScan(target, key, nextValue);
      }
      // An array holds values. Its elements leave as themselves, frozen, so an
      // element compares equal however it was reached -- an index, a scan, a
      // getter -- and a reader depends on its identity, which structural
      // sharing changes on any write inside it. A frozen target is one such
      // value reached through an alias; it cannot return proxies of its own.
      // Either way only an own key holds state: an inherited one, such as the
      // `Object.prototype` that `__proto__` reads, must never be frozen.
      const isValue =
        isStateObject &&
        isOwn &&
        (Array.isArray(target) || Object.isFrozen(target)) &&
        exposesStateValues(internal);
      // Nothing can be recorded without an active subscriber, so skip the
      // whole node-resolving step for untracked reads.
      if (!isReactiveTrackingActive()) {
        return isValue
          ? freezeStateValue(nextValue)
          : toReadonlyStateValue(internal, nextValue, sliceKey);
      }
      // `Reflect.has` walks the prototype chain; an own key can never be
      // missing, so only ask when the key is not the target's own.
      const isTracked =
        isOwn ||
        !Reflect.has(target, key) ||
        (Array.isArray(target) && key === 'length');
      if (!isStateObject && !isTracked) {
        return nextValue;
      }
      // Each recorded path's child node is one map lookup from the node the
      // meta already holds, so a read never builds a path to be tracked.
      const basePaths = meta.paths;
      let child: ReactivePathNode | undefined;
      for (let index = 0; index < basePaths.length; index += 1) {
        child = trackReactiveChild(
          metaNode(meta, index),
          key,
          isStateObject && !isValue
        );
      }
      if (!isStateObject) {
        return nextValue;
      }
      if (isValue) {
        return freezeStateValue(nextValue);
      }
      return basePaths.length === 1 && !internal.computedReadDepth
        ? toReadonlyChildValue(
            internal,
            nextValue as object,
            sliceKey,
            basePaths[0],
            key,
            child!
          )
        : toReadonlyStateValue(
            internal,
            nextValue,
            sliceKey,
            basePaths.map((path) => [...path, key])
          );
    },
    has(target, key) {
      if (isReactiveTrackingActive()) {
        for (let index = 0; index < meta.paths.length; index++) {
          trackReactiveStructureNode(metaNode(meta, index));
        }
      }
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      if (isReactiveTrackingActive()) {
        for (let index = 0; index < meta.paths.length; index++) {
          trackReactiveStructureNode(metaNode(meta, index));
        }
      }
      return Reflect.ownKeys(target);
    },
    set: rejectMutation,
    deleteProperty: rejectMutation,
    defineProperty: rejectMutation,
    setPrototypeOf: rejectMutation
  });
  cache.set(value as object, proxy);
  readonlyProxySource.set(proxy, value as object);
  publicStatePathMeta.set(proxy, meta);
  if (paths) {
    for (const path of paths) {
      addReactivePathTo(meta, path, true);
    }
  }
  return proxy;
};

/**
 * The object-valued case of a tracked single-path read. A cached proxy whose
 * one path ends at this node needs nothing merged, so the child path is only
 * built the first time a value is reached there.
 */
const toReadonlyChildValue = <T extends CreateState>(
  internal: Internal<T>,
  value: object,
  sliceKey: PropertyKey | undefined,
  basePath: ReactivePath,
  key: PropertyKey,
  node: ReactivePathNode
): unknown => {
  const cached =
    internal.mutableInstance || internal.isBatching
      ? undefined
      : readonlyProxyCache.get(internal)?.get(value);
  const cachedMeta = cached && publicStatePathMeta.get(cached);
  if (cachedMeta && cachedMeta.paths.length === 1) {
    if (cachedMeta.nodes?.[0] === node) return cached;
  }
  const result = toReadonlyStateValue(internal, value, sliceKey, [
    [...basePath, key]
  ]);
  const meta =
    result !== value ? publicStatePathMeta.get(result as object) : undefined;
  // A single path of this length ending in this key can only be the one just
  // merged: an alias would have added a second path, and an ancestor already
  // recorded is shorter.
  const path = meta && meta.paths.length === 1 ? meta.paths[0] : undefined;
  if (path?.length === basePath.length + 1 && path[basePath.length] === key) {
    (meta!.nodes ??= [])[0] = node;
  }
  return result;
};

const toPublicComputedValue = <T extends CreateState>(
  internal: Internal<T>,
  value: unknown,
  sliceKey?: PropertyKey
) => {
  if (!isImmutableStateObject(value)) {
    return value;
  }
  const cache = internal.computedSnapshotCache;
  const rootSnapshot = cache?.get(internal.rootState as unknown as object);
  const sources = (internal.computedSnapshotSources ??= new WeakMap());
  let source = sources.get(value);
  if (!source && Object.isFrozen(value) && rootSnapshot) {
    indexImmutableStateSnapshot(internal.rootState, rootSnapshot, sources);
    source = sources.get(value);
  }
  if (!source) {
    return value;
  }
  internal.computedIdentityRequired = true;
  // A getter returning a value held inside an array returns that value, as
  // reading it through the state does.
  return elementSnapshots.has(value as object) && exposesStateValues(internal)
    ? freezeStateValue(source)
    : toReadonlyStateValue(internal, source, sliceKey);
};

export const prepareStateDescriptor = <T extends CreateState>({
  descriptor,
  initialStateSeen,
  internal,
  key,
  rawState,
  sliceKey
}: PrepareStateDescriptorOptions<T>) => {
  const isComputed = descriptor.value instanceof Computed;
  const readStateValue = () =>
    typeof sliceKey !== 'undefined'
      ? (internal.rootState as any)[sliceKey][key]
      : (internal.rootState as any)[key];
  const initialValue = isComputed
    ? descriptor.value
    : sanitizeInitialStateValue(descriptor.value, initialStateSeen);
  if (internal.mutableInstance) {
    Object.defineProperty(rawState, key, {
      get: () => internal.mutableInstance[key],
      set: (value) => {
        internal.mutableInstance[key] = value;
      },
      configurable: true,
      enumerable: descriptor.enumerable
    });
  } else if (!isComputed) {
    Object.defineProperty(rawState, key, {
      value: initialValue,
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true
    });
  }

  if (isComputed) {
    if (internal.mutableInstance) {
      throw new Error('Computed is not supported with mutable instance');
    }
    const getComputed = (descriptor.value as Computed).createGetter({
      internal
    });
    descriptor.get = function () {
      return toPublicComputedValue(internal, getComputed.call(this), sliceKey);
    };
  } else {
    const path: ReactivePath =
      typeof sliceKey === 'undefined' ? [key] : [sliceKey, key];
    const paths = [path];
    let node: ReactivePathNode | undefined;
    descriptor.get = () => {
      const value = readStateValue();
      if (isReactiveTrackingActive()) {
        if (node === undefined || node.pruned) {
          node = getReactivePathNode(internal, path);
        }
        if (isImmutableStateObject(value)) trackReactiveTraversalNode(node);
        else trackReactiveNode(node);
      }
      return toReadonlyStateValue(internal, value, sliceKey, paths);
    };
    descriptor.set = (value: unknown) => {
      assertImmutableStateMutationAllowed(internal);
      const target =
        typeof sliceKey === 'undefined'
          ? internal.rootState
          : (internal.rootState as any)[sliceKey];
      (target as any)[key] = value;
    };
  }

  // handle state property
  delete descriptor.value;
  delete descriptor.writable;
};

export const prepareAccessorDescriptor = <T extends CreateState>({
  descriptor,
  internal,
  sliceKey
}: Pick<
  PrepareStateDescriptorOptions<T>,
  'descriptor' | 'internal' | 'sliceKey'
>) => {
  if (internal.mutableInstance || typeof descriptor.get !== 'function') {
    return;
  }
  const getComputed = createCachedGetter(internal, descriptor.get);
  descriptor.get = function () {
    return toPublicComputedValue(internal, getComputed.call(this), sliceKey);
  };
};
