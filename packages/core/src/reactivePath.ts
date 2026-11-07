import { getActiveSub, signal } from 'alien-signals';
import type { Patches } from 'mutative';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import { sharedRegistry } from './sharedRegistry';
import { isArrayIndexKey } from './arrayIndex';
import { areShallowEqualWithArray } from './utils';

export type ReactivePath = readonly PropertyKey[];

export type ReactivePathNode = {
  children?: Map<PropertyKey, ReactivePathNode>;
  /** How many of the children are keyed by an array index. */
  indexChildren: number;
  parent?: ReactivePathNode;
  key?: PropertyKey;
  valueVersion?: ReturnType<typeof signal<number>>;
  structureVersion?: ReturnType<typeof signal<number>>;
  valueTick: number;
  structureTick: number;
  valueSubscribers: number;
  structureSubscribers: number;
  valuePersistent?: boolean;
  structurePersistent?: boolean;
  owner: Internal<any>;
  /**
   * The collection that last recorded this node, and the node's slot in it.
   * A read compares one stamp instead of looking the node up in a map.
   */
  stamp: number;
  slot: number;
  /**
   * Set once the node has left the trie. Proxies and getters hold nodes
   * directly, so they resolve the path again rather than record a node that
   * no write can reach.
   */
  pruned?: boolean;
};

const VALUE_DEPENDENCY = 1;
const STRUCTURE_DEPENDENCY = 2;
const TERMINAL_DEPENDENCY = 4;
/** A child was read through the node, so its value read was only a step. */
const TRAVERSED_DEPENDENCY = 8;
const COUNTED_DEPENDENCIES = VALUE_DEPENDENCY | STRUCTURE_DEPENDENCY;

/** The dependencies of one evaluation in progress, in first-read order. */
type ReactiveCollection = {
  subscriber: object;
  stamp: number;
  nodes: ReactivePathNode[];
  masks: number[];
  outer: ReactiveCollection | undefined;
  /** An unfinished evaluation of the same subscriber. */
  previous?: ReactiveCollection;
  /** Closed while a collection nested in it is still running. */
  closed?: boolean;
};

type ReactiveSubscriberState = {
  /** The committed dependency set, as parallel arrays. */
  nodes: ReactivePathNode[];
  masks: number[];
  collection?: ReactiveCollection;
};

// Shared across entry points; see sharedRegistry.ts.
const reactiveSubscribers = sharedRegistry.reactiveSubscribers as WeakMap<
  object,
  ReactiveSubscriberState
>;
// A tracker from `coaction/adapter` collects reads made through a store that
// `coaction` created, so the collection in progress cannot be module-local.
const collector = sharedRegistry.reactiveCollector as {
  active: ReactiveCollection | undefined;
  stamp: number;
};

const createNode = (
  owner: Internal<any>,
  parent?: ReactivePathNode,
  key?: PropertyKey
): ReactivePathNode => ({
  owner,
  parent,
  key,
  indexChildren: 0,
  valueTick: 0,
  structureTick: 0,
  valueSubscribers: 0,
  structureSubscribers: 0,
  stamp: 0,
  slot: 0
});

const addChild = (parent: ReactivePathNode, key: PropertyKey) => {
  const child = createNode(parent.owner, parent, key);
  (parent.children ??= new Map()).set(key, child);
  if (isArrayIndexKey(key)) parent.indexChildren += 1;
  return child;
};

const normalizePointerSegment = (segment: string) =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

export const normalizeReactivePath = (path: unknown): PropertyKey[] => {
  if (Array.isArray(path)) {
    return path.map((segment) =>
      typeof segment === 'number' ? String(segment) : (segment as PropertyKey)
    );
  }
  if (typeof path !== 'string') {
    return [];
  }
  if (path === '') {
    return [];
  }
  return path.split('/').slice(1).map(normalizePointerSegment);
};

const getRoot = <T extends CreateState>(
  internal: Internal<T>
): ReactivePathNode => (internal.reactivePathRoot ??= createNode(internal));

const getNode = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath,
  create: boolean
): ReactivePathNode | undefined => {
  const root = create ? getRoot(internal) : internal.reactivePathRoot;
  if (!root) {
    return undefined;
  }
  let node: ReactivePathNode = root;
  for (const segment of path) {
    let child: ReactivePathNode | undefined = node.children?.get(segment);
    if (!child) {
      if (!create) {
        return undefined;
      }
      child = addChild(node, segment);
    }
    node = child;
  }
  return node;
};

/** @internal The node for a path, created on demand. */
export const getReactivePathNode = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => getNode(internal, path, true)!;

/** @internal The node for one key below a node, created on demand. */
export const getChildReactiveNode = (
  parent: ReactivePathNode,
  key: PropertyKey
) => parent.children?.get(key) ?? addChild(parent, key);

/** @internal A held node, or the node now in the trie at its path. */
export const liveReactiveNode = (node: ReactivePathNode) => {
  if (!node.pruned) return node;
  const path: PropertyKey[] = [];
  for (let current = node; current.parent; current = current.parent) {
    path.push(current.key!);
  }
  return getNode(node.owner, path.reverse(), true)!;
};

export const hasReactivePathNodes = <T extends CreateState>(
  internal: Internal<T>
) => Boolean(internal.reactivePathActiveCount);

/** Read the current semantic value version for an already-known path. */
export const getReactivePathVersion = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => getNode(internal, path, false)?.valueTick ?? 0;

const hasActiveDependency = (node: ReactivePathNode) =>
  node.valueSubscribers > 0 ||
  node.structureSubscribers > 0 ||
  node.valuePersistent ||
  node.structurePersistent;

const pruneNode = (node: ReactivePathNode) => {
  if (hasActiveDependency(node) || node.children?.size) {
    return;
  }
  const parent = node.parent;
  if (!parent || typeof node.key === 'undefined') {
    return;
  }
  if (parent.children?.get(node.key) === node) {
    parent.children.delete(node.key);
    if (isArrayIndexKey(node.key)) parent.indexChildren -= 1;
    if (parent.children.size === 0) {
      parent.children = undefined;
    }
  }
  node.pruned = true;
  node.valueVersion = undefined;
  node.structureVersion = undefined;
  pruneNode(parent);
};

const updateSubscriberCount = (
  node: ReactivePathNode,
  mask: number,
  delta: 1 | -1,
  shouldPrune = true
) => {
  if (mask & VALUE_DEPENDENCY) {
    node.valueSubscribers += delta;
  }
  if (mask & STRUCTURE_DEPENDENCY) {
    node.structureSubscribers += delta;
  }
  node.owner.reactivePathActiveCount = Math.max(
    0,
    (node.owner.reactivePathActiveCount ?? 0) +
      delta * Number(Boolean(mask & VALUE_DEPENDENCY)) +
      delta * Number(Boolean(mask & STRUCTURE_DEPENDENCY))
  );
  if (delta < 0 && shouldPrune) {
    pruneNode(node);
  }
};

const markPersistent = (node: ReactivePathNode, mask: number) => {
  if (mask & VALUE_DEPENDENCY && !node.valuePersistent) {
    node.valuePersistent = true;
    node.owner.reactivePathActiveCount =
      (node.owner.reactivePathActiveCount ?? 0) + 1;
  }
  if (mask & STRUCTURE_DEPENDENCY && !node.structurePersistent) {
    node.structurePersistent = true;
    node.owner.reactivePathActiveCount =
      (node.owner.reactivePathActiveCount ?? 0) + 1;
  }
};

const linkSignals = (node: ReactivePathNode, mask: number) => {
  if (mask & VALUE_DEPENDENCY) {
    (node.valueVersion ??= signal(node.valueTick))();
  }
  if (mask & STRUCTURE_DEPENDENCY) {
    (node.structureVersion ??= signal(node.structureTick))();
  }
};

/**
 * Add to a node's entry in a collection.
 *
 * This runs on every tracked property read, so it is a stamp compare and an
 * array push: the node was resolved by the caller, a repeated read only widens
 * its mask, and signal links wait until the collection ends.
 */
const collect = (
  collection: ReactiveCollection,
  node: ReactivePathNode,
  mask: number
) => {
  if (node.stamp === collection.stamp) {
    collection.masks[node.slot] |= mask;
    return;
  }
  // A nested collection may have restamped the node. A second entry is
  // harmless: the entries of a node are merged when the collection ends.
  node.stamp = collection.stamp;
  node.slot = collection.nodes.length;
  collection.nodes.push(node);
  collection.masks.push(mask);
};

/**
 * A foreign subscriber -- a bare `computed` or `effect` -- has no finalization
 * pass to tell a traversal step from a returned object, so it keeps the
 * conservative persistent link it always had.
 */
const recordForeign = (node: ReactivePathNode, mask: number) => {
  const foreignMask =
    mask & STRUCTURE_DEPENDENCY ? STRUCTURE_DEPENDENCY : VALUE_DEPENDENCY;
  markPersistent(node, foreignMask);
  linkSignals(node, foreignMask);
};

/**
 * Record a read for whichever subscriber is active, which the caller has
 * already looked up.
 */
const recordFor = (
  subscriber: object,
  node: ReactivePathNode,
  mask: number
) => {
  const collection = collector.active;
  if (collection !== undefined && collection.subscriber === subscriber) {
    collect(collection, node, mask);
  } else {
    recordForeign(node, mask);
  }
};

const record = (node: ReactivePathNode, mask: number) => {
  const subscriber = getActiveSub();
  if (subscriber) {
    recordFor(subscriber, node, mask);
  }
};

/** @internal Track a terminal value read of a node. */
export const trackReactiveNode = (node: ReactivePathNode) =>
  record(node, VALUE_DEPENDENCY | TERMINAL_DEPENDENCY);

/**
 * @internal Track an object/array access that may only be a traversal step.
 * Coaction trackers drop it when a child is read through it in the same pass.
 */
export const trackReactiveTraversalNode = (node: ReactivePathNode) =>
  record(node, VALUE_DEPENDENCY);

/** @internal Track existence/key-order reads of a node. */
export const trackReactiveStructureNode = (node: ReactivePathNode) =>
  record(node, STRUCTURE_DEPENDENCY);

/**
 * @internal Track a read of `key` through `parent`, and return the child node.
 *
 * The one call a tracked property read makes: it resolves the child, records
 * in the collection that the parent was only traversed -- in that collection's
 * own entry, which a nested collection reading the same parent cannot touch --
 * and records the child as a terminal value, or as a traversal step when
 * `traversal` is set.
 */
export const trackReactiveChild = (
  parent: ReactivePathNode,
  key: PropertyKey,
  traversal: boolean
) => {
  const child = getChildReactiveNode(parent, key);
  const subscriber = getActiveSub();
  if (subscriber) {
    const mask = traversal
      ? VALUE_DEPENDENCY
      : VALUE_DEPENDENCY | TERMINAL_DEPENDENCY;
    const collection = collector.active;
    if (collection !== undefined && collection.subscriber === subscriber) {
      collect(collection, parent, TRAVERSED_DEPENDENCY);
      collect(collection, child, mask);
    } else {
      recordForeign(child, mask);
    }
  }
  return child;
};

/** Register a Coaction-owned tracker so path-node lifetimes can be reclaimed. */
export const registerReactiveSubscriber = (subscriber: object) => {
  reactiveSubscribers.set(subscriber, { nodes: [], masks: [] });
};

/** Begin collecting the exact path dependencies for one tracker evaluation. */
export const beginReactiveSubscriberTrack = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  if (!state) {
    return;
  }
  const collection: ReactiveCollection = {
    subscriber,
    stamp: ++collector.stamp,
    nodes: [],
    masks: [],
    outer: collector.active,
    previous: state.collection
  };
  state.collection = collection;
  collector.active = collection;
};

/** @internal Preserve object identity reads for a conservative derived selector. */
export const retainReactiveTraversalPaths = (subscriber: object) => {
  const masks = reactiveSubscribers.get(subscriber)?.collection?.masks ?? [];
  for (let index = 0; index < masks.length; index++) {
    if (masks[index] & VALUE_DEPENDENCY) masks[index] |= TERMINAL_DEPENDENCY;
  }
};

const closeCollection = (collection: ReactiveCollection) => {
  collection.closed = true;
  // Disposal can close an ancestor of the active collection, which stays on
  // the stack until what runs inside it has unwound.
  while (collector.active?.closed) {
    collector.active = collector.active.outer;
  }
};

/**
 * Reconcile a finished collection with the subscriber's committed set.
 *
 * Object property access is initially provisional: it may be the terminal
 * value, or merely a step toward a deeper leaf. A step that a child was read
 * through in this collection is dropped; explicit terminal markers (selector
 * return values / React props) keep the object when its identity is consumed.
 * A value dependency that also tracks structure is covered by the structure.
 *
 * Stamps replace the maps a diff would otherwise need: the committed nodes are
 * stamped with their slot, and each recorded node is restamped with its slot
 * in the next set, where it finds its previous mask. That pass merges the
 * entries a nested collection can split a node into, so the rules above see
 * every read of a node at once. Signal links are established once per
 * dependency, while the collecting subscriber is still active and in
 * first-read order -- which is what lets a re-tracked subscriber reuse them.
 */
export const endReactiveSubscriberTrack = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  const collection = state?.collection;
  if (!state || !collection) {
    return;
  }
  state.collection = collection.previous;
  closeCollection(collection);
  const previous = ++collector.stamp;
  for (let index = 0; index < state.nodes.length; index++) {
    state.nodes[index].stamp = previous;
    state.nodes[index].slot = index;
  }
  const current = ++collector.stamp;
  // Merge each node's entries in place: a nested collection can split a node
  // into several, and the rules above need all of its reads at once.
  const nodes = collection.nodes;
  const masks = collection.masks;
  const previousMasks: number[] = [];
  let length = 0;
  for (let index = 0; index < nodes.length; index++) {
    const node = liveReactiveNode(nodes[index]);
    if (node.stamp === current) {
      masks[node.slot] |= masks[index];
      continue;
    }
    previousMasks.push(node.stamp === previous ? state.masks[node.slot] : 0);
    node.stamp = current;
    node.slot = length;
    nodes[length] = node;
    masks[length] = masks[index];
    length += 1;
  }
  // Then minimise and compact again. A node that keeps no dependency is
  // unstamped, so the removal pass below reads it as gone.
  let kept = 0;
  for (let index = 0; index < length; index++) {
    const node = nodes[index];
    let mask = masks[index];
    if (
      !(mask & TERMINAL_DEPENDENCY) &&
      mask & (TRAVERSED_DEPENDENCY | STRUCTURE_DEPENDENCY)
    ) {
      mask &= ~VALUE_DEPENDENCY;
    }
    mask &= COUNTED_DEPENDENCIES;
    if (!mask) {
      node.stamp = 0;
      continue;
    }
    // A reentrant call belongs to the evaluation it runs in. Its reads have
    // been minimised against its own traversals, so they stay terminal there.
    if (state.collection) {
      state.collection.nodes.push(node);
      state.collection.masks.push(mask | TERMINAL_DEPENDENCY);
      continue;
    }
    linkSignals(node, mask);
    const addedMask = mask & ~previousMasks[index];
    if (addedMask) {
      updateSubscriberCount(node, addedMask, 1);
    }
    node.slot = kept;
    nodes[kept] = node;
    masks[kept] = mask;
    kept += 1;
  }
  if (state.collection) return;
  nodes.length = kept;
  masks.length = kept;
  const removedNodes: ReactivePathNode[] = [];
  for (let index = 0; index < state.nodes.length; index++) {
    const node = state.nodes[index];
    const nextMask = node.stamp === current ? masks[node.slot] : 0;
    const removedMask = state.masks[index] & ~nextMask;
    if (removedMask) {
      updateSubscriberCount(node, removedMask, -1, false);
      removedNodes.push(node);
    }
  }
  removedNodes.forEach(pruneNode);
  state.nodes = nodes;
  state.masks = masks;
};

/** Release every path dependency owned by a disposed framework tracker. */
export const disposeReactiveSubscriber = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  if (!state) {
    return;
  }
  while (state.collection) {
    closeCollection(state.collection);
    state.collection = state.collection.previous;
  }
  for (let index = 0; index < state.nodes.length; index++) {
    updateSubscriberCount(state.nodes[index], state.masks[index], -1);
  }
  reactiveSubscribers.delete(subscriber);
};

/**
 * Whether a reactive subscriber is collecting dependencies right now.
 *
 * Reads outside a tracked scope -- action bodies, event handlers, a bare
 * `getState()` -- cannot record anything, so the public state proxy checks this
 * once per access and skips resolving child nodes entirely.
 */
export const isReactiveTrackingActive = () => Boolean(getActiveSub());

export const trackReactivePath = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => {
  if (getActiveSub()) {
    trackReactiveNode(getNode(internal, path, true)!);
  }
};

const invalidateNode = (node: ReactivePathNode, deep: boolean) => {
  if (node.valueVersion) {
    node.valueTick += 1;
    node.valueVersion(node.valueTick);
  }
  if (deep && node.structureVersion) {
    node.structureTick += 1;
    node.structureVersion(node.structureTick);
  }
  if (deep && node.children) {
    node.children.forEach((child) => invalidateNode(child, true));
  }
};

const invalidateValue = (node: ReactivePathNode | undefined) => {
  if (!node?.valueVersion) {
    return;
  }
  node.valueTick += 1;
  node.valueVersion(node.valueTick);
};

const invalidateStructure = (node: ReactivePathNode | undefined) => {
  if (!node?.structureVersion) {
    return;
  }
  node.structureTick += 1;
  node.structureVersion(node.structureTick);
};

const getValueAtPath = (root: unknown, path: readonly PropertyKey[]) => {
  let value = root as any;
  for (const segment of path) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[segment as any];
  }
  return value;
};

/** Fewer element nodes than this are visited one by one, which costs little. */
const minElementNodes = 16;
/**
 * Comparing a pair of elements takes about a quarter of the time visiting an
 * element's node does, so the elements are compared once the array holds no
 * more than this many for each node.
 */
const elementsPerNode = 4;

// Held as they were when this module loaded; an entry that never compares
// arrays drops them.
const arrayIteration = /* @__PURE__ */ (() => {
  const values = Array.prototype[Symbol.iterator];
  const iterator = Object.getPrototypeOf(values.call([]));
  return { values, iterator, next: iterator.next };
})();

/**
 * The elements of an array, in an array V8 reads at full speed. Reading an
 * element of a frozen array takes about four times as long, and a read that has
 * seen a frozen array stays slow for the arrays after it; a spread copies one in
 * a fraction of that time. An array held inside another array is frozen when it
 * is handed out, so the array a write replaces can be one. An array whose
 * iteration could run code of its own is read as it is.
 */
const readableElements = (array: readonly unknown[]) =>
  Object.isFrozen(array) &&
  Object.getPrototypeOf(array) === Array.prototype &&
  !Object.prototype.hasOwnProperty.call(array, Symbol.iterator) &&
  Array.prototype[Symbol.iterator] === arrayIteration.values &&
  arrayIteration.iterator.next === arrayIteration.next
    ? [...array]
    : array;

/**
 * Queue the children of a changed array whose value changed: compare the two
 * arrays element by element, and look up the node of only an element that
 * changed. Rows of a list that each read their own element give the array a
 * node per element, and a write changes one of them, so looking up each node's
 * element took a step per row. Declines, for the caller to visit each child,
 * when a child is keyed by neither an index nor `length`, or when the arrays
 * are too long for the nodes there are.
 */
const queueChangedElements = (
  node: ReactivePathNode,
  previous: readonly unknown[],
  next: readonly unknown[],
  nodes: ReactivePathNode[],
  previousValues: unknown[],
  nextValues: unknown[]
) => {
  const children = node.children!;
  let named = children.size - node.indexChildren;
  const lengthNode = named > 0 ? children.get('length') : undefined;
  if (lengthNode !== undefined) named -= 1;
  const length = Math.max(previous.length, next.length);
  if (named > 0 || length > node.indexChildren * elementsPerNode) return false;
  if (lengthNode !== undefined && previous.length !== next.length) {
    nodes.push(lengthNode);
    previousValues.push(previous.length);
    nextValues.push(next.length);
  }
  // An index at or past the end of both arrays holds nothing on either side.
  const before = readableElements(previous);
  const after = readableElements(next);
  for (let index = 0; index < length; index += 1) {
    const previousValue = before[index];
    const nextValue = after[index];
    if (Object.is(previousValue, nextValue)) continue;
    const child = children.get(String(index));
    if (child !== undefined) {
      nodes.push(child);
      previousValues.push(previousValue);
      nextValues.push(nextValue);
    }
  }
  return true;
};

/** A read set can be checked directly without producing a patch journal.
 * Walk only its trie, including existence/key-order dependencies. Immutable
 * identity skips unchanged subtrees; an iterative walk also handles deep paths.
 */
export const invalidateReactiveTransition = <T extends CreateState>(
  internal: Internal<T>,
  before: unknown,
  after: unknown
) => {
  const root = internal.reactivePathRoot;
  if (!root || Object.is(before, after)) return;
  // Three parallel stacks of nodes whose value changed identity. A child is
  // compared before it is queued: a write changes one element of a large
  // array, and queueing every child to compare later allocated per child.
  const nodes: ReactivePathNode[] = [root];
  const previousValues: any[] = [before];
  const nextValues: any[] = [after];
  let previous: any;
  let next: any;
  const queueChanged = (child: ReactivePathNode, key: PropertyKey) => {
    const previousValue = previous?.[key];
    const nextValue = next?.[key];
    if (!Object.is(previousValue, nextValue)) {
      nodes.push(child);
      previousValues.push(previousValue);
      nextValues.push(nextValue);
    }
  };
  while (nodes.length) {
    const node = nodes.pop()!;
    previous = previousValues.pop();
    next = nextValues.pop();
    invalidateValue(node);
    if (
      node.structureVersion &&
      (previous === null ||
        typeof previous !== 'object' ||
        next === null ||
        typeof next !== 'object' ||
        Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next) ||
        !areShallowEqualWithArray(
          Reflect.ownKeys(previous),
          Reflect.ownKeys(next)
        ))
    ) {
      invalidateStructure(node);
    }
    if (node.children === undefined) continue;
    if (
      node.indexChildren < minElementNodes ||
      !Array.isArray(previous) ||
      !Array.isArray(next) ||
      !queueChangedElements(
        node,
        previous,
        next,
        nodes,
        previousValues,
        nextValues
      )
    ) {
      node.children.forEach(queueChanged);
    }
  }
};

export const invalidateReactivePaths = <T extends CreateState>(
  internal: Internal<T>,
  patches?: Patches
) => {
  const root = internal.reactivePathRoot;
  if (!root) {
    return;
  }
  // The notification runtime owns the batch. Invalidate before publishing
  // commits so getters are current, then flush effects after the write closes.
  if (!patches) {
    invalidateNode(root, true);
    return;
  }
  for (const patch of patches) {
    const path = normalizeReactivePath(patch.path);
    if (!path.length) {
      invalidateNode(root, true);
      continue;
    }
    // A selector that returns the complete public state facade tracks the
    // root value. Any non-root patch changes that aggregate value.
    invalidateValue(root);
    // Coarse object-valued reads (used by computed getters returning or
    // traversing frozen snapshots) subscribe to an ancestor value node.
    // Notify those ancestors without invalidating sibling descendants.
    let node: ReactivePathNode | undefined = root;
    let parentNode: ReactivePathNode | undefined;
    for (let depth = 0; depth < path.length; depth++) {
      parentNode = node;
      node = node?.children?.get(path[depth]);
      if (depth < path.length - 1) invalidateValue(node);
    }
    if (node) invalidateNode(node, true);
    const parentPath = path.slice(0, -1);
    if (patch.op === 'add' || patch.op === 'remove') {
      invalidateStructure(parentNode);
    }

    // Array insertions/removals shift only indexes at or after the changed
    // position. Preserve dependencies on stable earlier indexes.
    const parentValue = getValueAtPath(internal.rootState, parentPath);
    const lastSegment = path[path.length - 1];
    const arrayIndex =
      typeof lastSegment === 'string' && /^(0|[1-9]\d*)$/.test(lastSegment)
        ? Number(lastSegment)
        : undefined;
    // Shortening an array through `length` drops elements without a patch
    // per index, so the indexes it removed are invalidated here. `rootState`
    // already holds the new value, so its length is the surviving count.
    if (
      lastSegment === 'length' &&
      patch.op === 'replace' &&
      Array.isArray(parentValue) &&
      parentNode
    ) {
      const survivors = parentValue.length;
      invalidateStructure(parentNode);
      for (const [key, child] of parentNode.children ?? []) {
        if (
          typeof key === 'string' &&
          /^(0|[1-9]\d*)$/.test(key) &&
          Number(key) >= survivors
        ) {
          invalidateNode(child, true);
        }
      }
    }

    if (
      Array.isArray(parentValue) &&
      parentNode &&
      (patch.op === 'add' || patch.op === 'remove') &&
      typeof arrayIndex === 'number'
    ) {
      invalidateValue(parentNode.children?.get('length'));
      for (const [key, child] of parentNode.children ?? []) {
        if (
          typeof key === 'string' &&
          /^(0|[1-9]\d*)$/.test(key) &&
          Number(key) > arrayIndex
        ) {
          invalidateNode(child, true);
        }
      }
    }
  }
};
