import { apply } from 'mutability';
import {
  type Store,
  createBinder,
  onStoreReady,
  replaceExternalStoreState
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

const replaceMutableState = (
  rawState: Record<PropertyKey, unknown>,
  mutableState: Record<PropertyKey, unknown>,
  publicState: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  const nextKeys = new Set<PropertyKey>();
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof source[key] === 'function') {
      continue;
    }
    nextKeys.add(key);
  }
  for (const key of getOwnEnumerableKeys(rawState)) {
    if (typeof rawState[key] === 'function') {
      continue;
    }
    if (!nextKeys.has(key)) {
      delete rawState[key];
      delete mutableState[key];
      delete publicState[key];
    }
  }
  nextKeys.forEach((key) => {
    rawState[key] = source[key];
    mutableState[key] = source[key];
    publicState[key] = source[key];
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
    visited.set(value, next);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        next[index] = toSnapshot(value[index], visited);
      }
    }
    return next;
  }
  if (typeof value === 'object' && value !== null) {
    if (visited.has(value)) {
      return visited.get(value);
    }
    const next: Record<PropertyKey, unknown> = {};
    visited.set(value, next);
    for (const key of getOwnEnumerableKeys(value)) {
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
  const syncSharedExternalChange = () => {
    const currentSnapshot = snapshotPureState(store);
    if (isApplyingCoactionState) {
      lastSnapshot = currentSnapshot;
      return true;
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
      return true;
    }
    lastSnapshot = currentSnapshot;
    return false;
  };
  const cancelReadySubscription = onStoreReady(store, () => {
    lastSnapshot = snapshotPureState(store);
    let isInitialRun = true;
    unsubscribeExternal = autorun(() => {
      touchObservableTree(state);
      if (isInitialRun) {
        isInitialRun = false;
        return;
      }
      untracked(() => {
        const isCoactionChange = syncSharedExternalChange();
        if (!isCoactionChange) {
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
  store.destroy = () => {
    cancelReadySubscription();
    unsubscribeExternal?.();
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
