import { apply } from 'mutability';
import {
  StateSchemaError,
  type Store,
  createBinder,
  onStoreReady,
  replaceExternalStoreState,
  sanitizeReplacementState
} from 'coaction';
import { autorun, runInAction, untracked } from 'mobx';

const instancesMap = new WeakMap<object, object>();

type StoreWithSubscriptions = Store<object> & {
  _subscriptions?: Set<() => void>;
};

type MobxInternal = {
  rootState?: object;
  toMutableRaw?: (key: object) => object | undefined;
  actMutable?: typeof runInAction;
  notifyStateChange?: () => void;
};

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

const isArrayIndexKey = (key: PropertyKey) => {
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  );
};

const isObjectRecord = (value: object) =>
  Object.prototype.toString.call(value) === '[object Object]';

const assertCanSetPublicStateKey = (
  publicState: Record<PropertyKey, unknown>,
  key: PropertyKey
) => {
  if (Object.prototype.hasOwnProperty.call(publicState, key)) {
    return;
  }
  if (Object.isExtensible(publicState)) {
    return;
  }
  throw new StateSchemaError(
    `Unknown state key '${String(key)}' cannot be added after store initialization. Coaction state schema is fixed.`
  );
};

const replaceMutableState = (
  rawState: Record<PropertyKey, unknown>,
  mutableState: Record<PropertyKey, unknown>,
  publicState: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  const nextKeys = new Set<PropertyKey>();
  for (const key of getOwnEnumerableKeys(source)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    if (typeof source[key] === 'function') {
      continue;
    }
    nextKeys.add(key);
  }
  for (const key of getOwnEnumerableKeys(rawState)) {
    if (isUnsafeKey(key)) {
      delete rawState[key];
      delete mutableState[key];
      continue;
    }
    if (typeof rawState[key] === 'function') {
      continue;
    }
    if (!nextKeys.has(key)) {
      delete rawState[key];
      delete mutableState[key];
    }
  }
  const rawSeen = new WeakMap<object, unknown>();
  const mutableSeen = new WeakMap<object, unknown>();
  const publicSeen = new WeakMap<object, unknown>();
  rawSeen.set(source, rawState);
  mutableSeen.set(source, mutableState);
  publicSeen.set(source, publicState);
  nextKeys.forEach((key) => {
    rawState[key] = sanitizeReplacementState(source[key], rawSeen);
    mutableState[key] = sanitizeReplacementState(source[key], mutableSeen);
    assertCanSetPublicStateKey(publicState, key);
    publicState[key] = sanitizeReplacementState(source[key], publicSeen);
  });
};

const toSnapshot = (
  value: unknown,
  visited = new WeakMap<object, unknown>()
): unknown => {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return visited.get(value);
    }
    const next: unknown[] = [];
    next.length = value.length;
    visited.set(value, next);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        next[index] = toSnapshot(value[index], visited);
      }
    }
    const source = value as unknown as Record<PropertyKey, unknown>;
    const target = next as unknown as Record<PropertyKey, unknown>;
    for (const key of getOwnEnumerableKeys(value)) {
      if (isArrayIndexKey(key) || isUnsafeKey(key)) {
        continue;
      }
      const child = source[key];
      if (typeof child !== 'function') {
        target[key] = toSnapshot(child, visited);
      }
    }
    return next;
  }
  if (typeof value === 'object' && value !== null) {
    if (!isObjectRecord(value)) {
      return value;
    }
    if (visited.has(value)) {
      return visited.get(value);
    }
    const next: Record<PropertyKey, unknown> = {};
    visited.set(value, next);
    for (const key of getOwnEnumerableKeys(value)) {
      if (isUnsafeKey(key)) {
        continue;
      }
      const child = (value as Record<PropertyKey, unknown>)[key];
      if (typeof child !== 'function') {
        next[key] = toSnapshot(child, visited);
      }
    }
    return next;
  }
  return value;
};

const snapshotPureState = (store: Store<object>) =>
  toSnapshot(store.getPureState()) as Record<PropertyKey, unknown>;

const isEqualSnapshot = (
  left: unknown,
  right: unknown,
  visited = new WeakMap<object, WeakSet<object>>()
): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray || left.length !== right.length) {
      return false;
    }
  } else if (!isObjectRecord(left) || !isObjectRecord(right)) {
    return false;
  }
  let seenTargets = visited.get(left);
  if (!seenTargets) {
    seenTargets = new WeakSet<object>();
    visited.set(left, seenTargets);
  } else if (seenTargets.has(right)) {
    return true;
  }
  seenTargets.add(right);
  const leftRecord = left as Record<PropertyKey, unknown>;
  const rightRecord = right as Record<PropertyKey, unknown>;
  const leftKeys = getOwnEnumerableKeys(left);
  const rightKeys = getOwnEnumerableKeys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) {
      return false;
    }
    if (!isEqualSnapshot(leftRecord[key], rightRecord[key], visited)) {
      return false;
    }
  }
  return true;
};

const deleteUnsafeEnumerableKeys = (
  value: unknown,
  seen = new WeakSet<object>()
) => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  const record = value as Record<PropertyKey, unknown>;
  for (const key of getOwnEnumerableKeys(value)) {
    if (isUnsafeKey(key)) {
      delete record[key];
      continue;
    }
    const child = record[key];
    if (typeof child !== 'function') {
      deleteUnsafeEnumerableKeys(child, seen);
    }
  }
};

const touchObservableTree = (value: unknown, seen = new WeakSet<object>()) => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    void value.length;
    value.forEach((item) => touchObservableTree(item, seen));
    return;
  }
  for (const key of Reflect.ownKeys(value as Record<PropertyKey, unknown>)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      continue;
    }
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (typeof child !== 'function') {
      touchObservableTree(child, seen);
    }
  }
};

const handleStore = (
  store: StoreWithSubscriptions,
  rawState: object,
  state: object,
  internal: MobxInternal
) => {
  if (internal.toMutableRaw) return;
  internal.toMutableRaw = (key: object) => instancesMap.get(key);
  store._subscriptions = new Set();
  let isApplyingCoactionState = false;
  let lastSnapshot: Record<PropertyKey, unknown> | undefined;
  let unsubscribeExternal: (() => void) | undefined;
  const restoreClientState = (snapshot: Record<PropertyKey, unknown>) => {
    const mutableState = internal.toMutableRaw!(rawState);
    if (!mutableState) {
      return;
    }
    isApplyingCoactionState = true;
    try {
      runInAction(() => {
        const currentRawState = (internal.rootState ?? rawState) as Record<
          PropertyKey,
          unknown
        >;
        replaceMutableState(
          currentRawState,
          mutableState as Record<PropertyKey, unknown>,
          store.getState() as Record<PropertyKey, unknown>,
          snapshot
        );
      });
    } finally {
      lastSnapshot = snapshotPureState(store);
      isApplyingCoactionState = false;
    }
  };
  const syncSharedExternalChange = () => {
    const currentSnapshot = snapshotPureState(store);
    if (isApplyingCoactionState) {
      lastSnapshot = currentSnapshot;
      return 'handled';
    }
    if (store.share === 'client' && lastSnapshot) {
      if (!isEqualSnapshot(currentSnapshot, lastSnapshot)) {
        restoreClientState(lastSnapshot);
      }
      return 'ignored';
    }
    if (store.share === 'main' && lastSnapshot) {
      const rootState = internal.rootState;
      internal.rootState = lastSnapshot;
      try {
        replaceExternalStoreState(
          store as any,
          internal as any,
          currentSnapshot,
          {
            syncImmutable: false
          }
        );
      } finally {
        internal.rootState = rootState;
      }
      lastSnapshot = currentSnapshot;
      return 'handled';
    }
    lastSnapshot = currentSnapshot;
    return 'external';
  };
  const cancelReadySubscription = onStoreReady(store, () => {
    runInAction(() => {
      const mutableState = internal.toMutableRaw!(rawState);
      if (!mutableState) {
        return;
      }
      const currentRawState = (internal.rootState ?? rawState) as Record<
        PropertyKey,
        unknown
      >;
      const seen = new WeakSet<object>();
      deleteUnsafeEnumerableKeys(currentRawState, seen);
      deleteUnsafeEnumerableKeys(mutableState, seen);
      deleteUnsafeEnumerableKeys(store.getState(), seen);
    });
    lastSnapshot = snapshotPureState(store);
    let isInitialRun = true;
    unsubscribeExternal = autorun(() => {
      touchObservableTree(state);
      if (isInitialRun) {
        isInitialRun = false;
        return;
      }
      untracked(() => {
        const change = syncSharedExternalChange();
        if (change === 'ignored') {
          return;
        }
        if (change === 'external') {
          internal.notifyStateChange?.();
        }
        store._subscriptions?.forEach((listener) => listener());
      });
    });
  });
  Object.assign(store, {
    subscribe: (listener: () => void) => {
      store._subscriptions!.add(listener);
      return () => {
        store._subscriptions?.delete(listener);
      };
    }
  });
  const baseDestroy = store.destroy;
  let destroyed = false;
  store.destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    cancelReadySubscription();
    unsubscribeExternal?.();
    unsubscribeExternal = undefined;
    store._subscriptions?.clear();
    store._subscriptions = undefined;
    baseDestroy();
  };
  internal.actMutable = runInAction;
  store.apply = (state = store.getState(), patches) => {
    isApplyingCoactionState = true;
    try {
      if (!patches) {
        runInAction(() => {
          const currentRawState = (internal.rootState ?? rawState) as Record<
            PropertyKey,
            unknown
          >;
          replaceMutableState(
            currentRawState,
            internal.toMutableRaw!(rawState) as Record<PropertyKey, unknown>,
            store.getState() as Record<PropertyKey, unknown>,
            state as Record<PropertyKey, unknown>
          );
        });
        return;
      }
      runInAction(() => {
        apply(state, patches!);
      });
    } finally {
      lastSnapshot = snapshotPureState(store);
      isApplyingCoactionState = false;
      internal.notifyStateChange?.();
    }
  };
};

interface BindMobx {
  <T>(target: T): T;
}

/**
 * Bind a store to Mobx
 */
export const bindMobx = createBinder<BindMobx>({
  handleStore,
  handleState: (options) => {
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const copyState = Object.defineProperties(
      {},
      descriptors
    ) as typeof options;
    const rawState = Object.defineProperties({}, descriptors) as typeof options;
    return {
      copyState,
      bind: (state) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }
});
