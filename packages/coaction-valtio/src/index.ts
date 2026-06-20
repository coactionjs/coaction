import { apply } from 'mutability';
import {
  createBinder,
  onStoreReady,
  replaceExternalStoreState,
  sanitizeReplacementState,
  type Store
} from 'coaction';
import { proxy, subscribe } from 'valtio/vanilla';

export * from 'valtio/vanilla';

const instancesMap = new WeakMap<object, object>();

type ValtioInternal = {
  rootState?: object;
  toMutableRaw?: (key: object) => object | undefined;
  notifyStateChange?: () => void;
};

type StoreWithDestroyers = Store<object> & {
  _destroyers?: Set<() => void>;
  _listeners?: Set<() => void>;
};

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

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
      delete publicState[key];
      continue;
    }
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
    const nextValue = sanitizeReplacementState(source[key]);
    rawState[key] = nextValue;
    mutableState[key] = nextValue;
    publicState[key] = nextValue;
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

const handleStore = (
  store: StoreWithDestroyers,
  rawState: object,
  state: object,
  internal: ValtioInternal
) => {
  if (!internal.toMutableRaw) {
    internal.toMutableRaw = (key: object) => instancesMap.get(key);
    const getMutableState = () => internal.toMutableRaw?.(rawState) ?? rawState;
    let isApplyingCoactionState = false;
    let lastSnapshot: Record<PropertyKey, unknown> | undefined;
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
    store._destroyers = new Set();
    store._listeners = new Set();
    let unsubscribeExternal: (() => void) | undefined;
    const cancelReadySubscription = onStoreReady(store, () => {
      lastSnapshot = snapshotPureState(store);
      unsubscribeExternal = subscribe(getMutableState(), () => {
        const isCoactionChange = syncSharedExternalChange();
        if (!isCoactionChange) {
          internal.notifyStateChange?.();
        }
        store._listeners?.forEach((listener) => listener());
      });
    });
    Object.assign(store, {
      subscribe: (listener: () => void) => {
        store._listeners!.add(listener);
        return () => {
          store._listeners?.delete(listener);
        };
      }
    });
    const baseDestroy = store.destroy;
    store.destroy = () => {
      cancelReadySubscription();
      unsubscribeExternal?.();
      store._listeners?.clear();
      store._listeners = undefined;
      store._destroyers?.forEach((destroy) => destroy());
      store._destroyers?.clear();
      store._destroyers = undefined;
      baseDestroy();
    };
    store.apply = (state = store.getState(), patches) => {
      isApplyingCoactionState = true;
      try {
        if (!patches) {
          const currentRawState = (internal.rootState ?? rawState) as Record<
            PropertyKey,
            unknown
          >;
          replaceMutableState(
            currentRawState,
            getMutableState() as Record<PropertyKey, unknown>,
            store.getState() as Record<PropertyKey, unknown>,
            state as Record<PropertyKey, unknown>
          );
          return;
        }
        apply(state, patches);
      } finally {
        lastSnapshot = snapshotPureState(store);
        isApplyingCoactionState = false;
        internal.notifyStateChange?.();
      }
    };
  }
};

interface BindValtio {
  <T extends object>(target: T): T;
}

/**
 * Bind a store to Valtio.
 */
export const bindValtio = createBinder<BindValtio>({
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

/**
 * Adapt a Valtio store type to state type.
 */
export const adapt = <T extends object>(store: T) => store as T;

export { proxy };
