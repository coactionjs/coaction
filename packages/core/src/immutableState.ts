import { apply, type Patches } from 'mutative';

export const isImmutableStateObject = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Snapshots of values held inside an array. The public state hands those out
 * as the frozen values themselves rather than as readonly proxies, so a getter
 * returning one has to map back to the value, not to its proxy.
 *
 * Only a getter that returns an object needs this, so a write marks the copies
 * it makes only while the snapshot sources are maintained -- the same switch
 * that keeps `sources` -- and indexing the sources marks what it finds.
 */
export const elementSnapshots = new WeakSet<object>();

export const getImmutableStateSnapshot = (
  value: unknown,
  cache: WeakMap<object, unknown>,
  withinArray = false
): unknown => {
  if (!isImmutableStateObject(value)) {
    return value;
  }
  const cached = cache.get(value) as object | undefined;
  if (cached) {
    if (withinArray) elementSnapshots.add(cached);
    return cached;
  }
  const isArray = Array.isArray(value);
  const snapshot: Record<PropertyKey, unknown> | unknown[] = isArray
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));
  cache.set(value, snapshot);
  if (withinArray) elementSnapshots.add(snapshot);
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === 'length') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      descriptor.value = getImmutableStateSnapshot(
        descriptor.value,
        cache,
        withinArray || isArray
      );
    }
    Object.defineProperty(snapshot, key, descriptor);
  }
  return Object.freeze(snapshot);
};

/** Carry forward scalar edits; build replacements from the committed identities.
 * Mutative.apply clones object payloads, losing both their frozen descendants
 * and the snapshot cache's source mapping. Reuse the cache directly instead.
 */
export const updateImmutableStateSnapshot = (
  state: unknown,
  previousSnapshot: unknown,
  patches: Patches,
  cache: WeakMap<object, unknown>,
  sources?: WeakMap<object, object>,
  scalarTree = false
) => {
  if (!patches.length) {
    getImmutableStateSnapshot(state, cache);
    return;
  }
  const patch = patches[0];
  if (
    scalarTree &&
    patches.length === 1 &&
    patch.op === 'replace' &&
    patch.path[patch.path.length - 1] !== 'length'
  ) {
    // This native producer has verified a dense plain tree and scalar payload.
    // Copy just its path, without drafting frozen arrays (whose concat copy is
    // expensive). All siblings already belong to the previous frozen snapshot.
    const parents: Array<[object, Record<PropertyKey, unknown>]> = [];
    let value = state as Record<PropertyKey, unknown>;
    let previous = previousSnapshot as Record<PropertyKey, unknown>;
    for (const key of patch.path) {
      parents.push([value, previous]);
      value = value[key] as typeof value;
      previous = previous[key] as typeof previous;
    }
    let next = patch.value;
    // The copy at a depth is held inside an array when any container above
    // it is one.
    let withinArray = parents.length;
    for (let index = 0; sources && index < parents.length; index += 1) {
      if (Array.isArray(parents[index][1])) {
        withinArray = index;
        break;
      }
    }
    for (let index = parents.length - 1; index >= 0; index -= 1) {
      const [source, parent] = parents[index];
      const copy = (
        Array.isArray(parent) ? [...parent] : { ...parent }
      ) as Record<PropertyKey, unknown>;
      copy[patch.path[index]] = next;
      next = Object.freeze(copy);
      if (index > withinArray) elementSnapshots.add(next);
      cache.set(source, next);
      sources?.set(next, source);
    }
    return;
  }
  const snapshot = patches.some(
    (patch) => typeof patch.value === 'object' && patch.value !== null
  )
    ? getImmutableStateSnapshot(state, cache)
    : apply(previousSnapshot as object, patches);
  finalizeImmutableStateSnapshot(state, snapshot, patches, cache, sources);
};

export const finalizeImmutableStateSnapshot = (
  state: unknown,
  snapshot: unknown,
  patches: Patches,
  cache: WeakMap<object, unknown>,
  sources?: WeakMap<object, object>
) => {
  const mapPair = (value: unknown, snapshotValue: unknown) => {
    if (
      isImmutableStateObject(value) &&
      isImmutableStateObject(snapshotValue)
    ) {
      cache.set(value, snapshotValue);
      sources?.set(snapshotValue, value);
    }
  };
  mapPair(state, snapshot);
  for (const patch of patches) {
    let value = state;
    let snapshotValue = snapshot;
    const ancestors: object[] = [];
    if (isImmutableStateObject(snapshotValue)) {
      ancestors.push(snapshotValue);
    }
    let withinArray = false;
    for (const key of patch.path) {
      if (
        !isImmutableStateObject(value) ||
        !isImmutableStateObject(snapshotValue)
      ) {
        break;
      }
      withinArray ||= Array.isArray(snapshotValue);
      value = (value as Record<PropertyKey, unknown>)[key];
      snapshotValue = (snapshotValue as Record<PropertyKey, unknown>)[key];
      mapPair(value, snapshotValue);
      if (isImmutableStateObject(snapshotValue)) {
        ancestors.push(snapshotValue);
        if (sources && withinArray) elementSnapshots.add(snapshotValue);
      }
    }
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      Object.freeze(ancestors[index]);
    }
  }
};

export const indexImmutableStateSnapshot = (
  state: unknown,
  snapshot: unknown,
  sources: WeakMap<object, object>,
  seen = new WeakSet<object>(),
  withinArray = false
) => {
  if (!isImmutableStateObject(state) || !isImmutableStateObject(snapshot)) {
    return;
  }
  // Marked before the revisit check: an alias can be reached through an
  // object key first and through an array later.
  if (withinArray) elementSnapshots.add(snapshot);
  if (seen.has(snapshot)) {
    return;
  }
  seen.add(snapshot);
  sources.set(snapshot, state);
  const isArray = Array.isArray(snapshot);
  for (const key of Reflect.ownKeys(state)) {
    const stateDescriptor = Object.getOwnPropertyDescriptor(state, key);
    const snapshotDescriptor = Object.getOwnPropertyDescriptor(snapshot, key);
    if (
      stateDescriptor &&
      snapshotDescriptor &&
      Object.prototype.hasOwnProperty.call(stateDescriptor, 'value') &&
      Object.prototype.hasOwnProperty.call(snapshotDescriptor, 'value')
    ) {
      indexImmutableStateSnapshot(
        stateDescriptor.value,
        snapshotDescriptor.value,
        sources,
        seen,
        withinArray || isArray
      );
    }
  }
};
