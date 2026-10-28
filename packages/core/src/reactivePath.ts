import { getActiveSub, signal } from 'alien-signals';
import type { Patches } from 'mutative';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import { sharedRegistry } from './sharedRegistry';
import { areShallowEqualWithArray } from './utils';

export type ReactivePath = readonly PropertyKey[];

export type ReactivePathNode = {
  children?: Map<PropertyKey, ReactivePathNode>;
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
  /** The collection that read a child through this node. */
  traversed: number;
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
const COUNTED_DEPENDENCIES = VALUE_DEPENDENCY | STRUCTURE_DEPENDENCY;

/** The dependencies of one evaluation in progress, in first-read order. */
type ReactiveCollection = {
  subscriber: object;
  stamp: number;
  nodes: ReactivePathNode[];
  masks: number[];
  outer: ReactiveCollection | undefined;
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
  valueTick: 0,
  structureTick: 0,
  valueSubscribers: 0,
  structureSubscribers: 0,
  stamp: 0,
  slot: 0,
  traversed: 0
});

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
      child = createNode(internal, node, segment);
      (node.children ??= new Map()).set(segment, child);
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
) => {
  let child = parent.children?.get(key);
  if (!child) {
    child = createNode(parent.owner, parent, key);
    (parent.children ??= new Map()).set(key, child);
  }
  return child;
};

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
 * Record a read for whichever subscriber is active.
 *
 * This runs on every tracked property read, so the Coaction case is a stamp
 * compare and an array push: the node was resolved by the caller, a repeated
 * read only widens its mask, and signal links wait until the collection ends.
 * A foreign subscriber -- a bare `computed` or `effect` -- has no finalization
 * pass to tell a traversal step from a returned object, so it keeps the
 * conservative persistent link it always had.
 */
const record = (node: ReactivePathNode, mask: number) => {
  const subscriber = getActiveSub();
  if (!subscriber) {
    return;
  }
  const collection = collector.active;
  if (collection !== undefined && collection.subscriber === subscriber) {
    if (node.stamp === collection.stamp) {
      collection.masks[node.slot] |= mask;
      return;
    }
    // A nested collection may have restamped the node. Pushing it again is
    // harmless: duplicates are merged when the collection ends.
    node.stamp = collection.stamp;
    node.slot = collection.nodes.length;
    collection.nodes.push(node);
    collection.masks.push(mask);
    return;
  }
  const foreignMask =
    mask & STRUCTURE_DEPENDENCY ? STRUCTURE_DEPENDENCY : VALUE_DEPENDENCY;
  markPersistent(node, foreignMask);
  linkSignals(node, foreignMask);
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
 * @internal A child is being read through this node. Only the collection that
 * performs the read is told: a nested one has its own provisional reads.
 */
export const markReactiveTraversed = (node: ReactivePathNode) => {
  const collection = collector.active;
  if (collection !== undefined && collection.subscriber === getActiveSub()) {
    node.traversed = collection.stamp;
  }
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
    outer: collector.active
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
  if (collector.active === collection) {
    collector.active = collection.outer;
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
 * stamped with their slot, each surviving node then finds its previous mask
 * there and is restamped with its slot in the next set, which also merges the
 * duplicates a nested collection can leave. Signal links are established once
 * per dependency, while the collecting subscriber is still active and in
 * first-read order -- which is what lets a re-tracked subscriber reuse them.
 */
export const endReactiveSubscriberTrack = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  const collection = state?.collection;
  if (!state || !collection) {
    return;
  }
  state.collection = undefined;
  closeCollection(collection);
  const previous = ++collector.stamp;
  for (let index = 0; index < state.nodes.length; index++) {
    state.nodes[index].stamp = previous;
    state.nodes[index].slot = index;
  }
  const current = ++collector.stamp;
  const nodes: ReactivePathNode[] = [];
  const masks: number[] = [];
  const previousMasks: number[] = [];
  for (let index = 0; index < collection.nodes.length; index++) {
    const recorded = collection.nodes[index];
    const node = liveReactiveNode(recorded);
    let mask = collection.masks[index];
    if (!(mask & TERMINAL_DEPENDENCY)) {
      if (mask & VALUE_DEPENDENCY && recorded.traversed === collection.stamp) {
        mask &= ~VALUE_DEPENDENCY;
      }
      if (mask & VALUE_DEPENDENCY && mask & STRUCTURE_DEPENDENCY) {
        mask &= ~VALUE_DEPENDENCY;
      }
    }
    mask &= COUNTED_DEPENDENCIES;
    if (!mask) continue;
    if (node.stamp === current) {
      masks[node.slot] |= mask;
      continue;
    }
    previousMasks.push(node.stamp === previous ? state.masks[node.slot] : 0);
    node.stamp = current;
    node.slot = nodes.length;
    nodes.push(node);
    masks.push(mask);
  }
  for (let index = 0; index < nodes.length; index++) {
    linkSignals(nodes[index], masks[index]);
    const addedMask = masks[index] & ~previousMasks[index];
    if (addedMask) {
      updateSubscriberCount(nodes[index], addedMask, 1);
    }
  }
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
  if (state.collection) {
    closeCollection(state.collection);
    state.collection = undefined;
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

/** A small read set can be checked directly without producing a patch journal.
 * Walk only its trie, including existence/key-order dependencies. Immutable
 * identity skips unchanged subtrees; an iterative walk also handles deep paths.
 */
export const invalidateReactiveTransition = <T extends CreateState>(
  internal: Internal<T>,
  before: unknown,
  after: unknown
) => {
  const root = internal.reactivePathRoot;
  if (!root) return;
  const pending: Array<[ReactivePathNode, any, any]> = [[root, before, after]];
  while (pending.length) {
    const [node, previous, next] = pending.pop()!;
    if (Object.is(previous, next)) continue;
    invalidateValue(node);
    if (node.structureVersion) {
      const object = (value: unknown): value is object =>
        value !== null && typeof value === 'object';
      if (
        !object(previous) ||
        !object(next) ||
        Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next) ||
        !areShallowEqualWithArray(
          Reflect.ownKeys(previous),
          Reflect.ownKeys(next)
        )
      ) {
        invalidateStructure(node);
      }
    }
    for (const [key, child] of node.children ?? []) {
      pending.push([child, previous?.[key], next?.[key]]);
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
