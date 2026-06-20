import { apply } from 'mutability';
import {
  createBinder,
  onStoreReady,
  replaceExternalStoreState,
  type Store
} from 'coaction';
import { createPinia, setActivePinia } from 'pinia';
import type {
  _GettersTree,
  DefineStoreOptions,
  StateTree,
  StoreDefinition
} from 'pinia';

export * from 'pinia';

const instancesMap = new WeakMap<object, unknown>();

type SubscriptionCallback = (...args: unknown[]) => void;

type PiniaStoreInstance = {
  $id: string;
  $subscribe: (callback: SubscriptionCallback) => () => void;
};

type PiniaInternal = {
  rootState?: object;
  toMutableRaw?: (key: object) => PiniaStoreInstance | undefined;
  notifyStateChange?: () => void;
};

type StoreWithSubscriptions = Store<object> & {
  _subscriptions?: Set<SubscriptionCallback>;
  _destroyers?: Set<() => void>;
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

type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

type ReadonlyKeys<T> = {
  [K in keyof T]: Equal<
    { [P in K]: T[P] },
    Readonly<{ [P in K]: T[P] }>
  > extends true
    ? K
    : never;
}[keyof T];

export type IStore<T extends object> = [
  string,
  Pick<T, Exclude<keyof T, ReadonlyKeys<T> | FunctionKeys<T>>>,
  {
    [K in ReadonlyKeys<T>]: (
      state: Pick<T, Exclude<keyof T, ReadonlyKeys<T> | FunctionKeys<T>>>
    ) => T[K];
  },
  Pick<T, FunctionKeys<T>>
];

const handleStore = (
  store: StoreWithSubscriptions,
  state: object,
  _: object,
  internal: PiniaInternal
) => {
  const rawState = state as Record<PropertyKey, unknown>;
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
  if (!internal.toMutableRaw) {
    internal.toMutableRaw = (key: object) =>
      instancesMap.get(key) as PiniaStoreInstance | undefined;
    Object.assign(store, {
      subscribe: (callback: SubscriptionCallback) => {
        store._subscriptions!.add(callback);
        return () => store._subscriptions!.delete(callback);
      }
    });
    store._subscriptions = new Set<SubscriptionCallback>();
    store._destroyers = new Set<() => void>();
    const baseDestroy = store.destroy;
    let destroyed = false;
    store.destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      baseDestroy();
      store._subscriptions!.clear();
      store._subscriptions = undefined;
      store._destroyers!.forEach((destroy) => destroy());
      store._destroyers = undefined;
    };
    store.apply = (nextState = store.getState(), patches) => {
      isApplyingCoactionState = true;
      try {
        if (!patches) {
          if (nextState === store.getState()) return;
          const currentRawState = (internal.rootState ?? rawState) as Record<
            PropertyKey,
            unknown
          >;
          replaceMutableState(
            currentRawState,
            internal.toMutableRaw!(rawState) as unknown as Record<
              PropertyKey,
              unknown
            >,
            store.getState() as Record<PropertyKey, unknown>,
            nextState as Record<PropertyKey, unknown>
          );
          return;
        }
        apply(nextState, patches);
      } finally {
        lastSnapshot = snapshotPureState(store);
        isApplyingCoactionState = false;
        internal.notifyStateChange?.();
      }
    };
  }
  const mutableStore = internal.toMutableRaw(state);
  if (!mutableStore) {
    throw new Error('Pinia store instance is not found');
  }
  let stopWatch: (() => void) | undefined;
  const cancelReadySubscription = onStoreReady(store, () => {
    lastSnapshot = snapshotPureState(store);
    stopWatch = mutableStore.$subscribe((...args: unknown[]) => {
      const isCoactionChange = syncSharedExternalChange();
      if (!isCoactionChange) {
        internal.notifyStateChange?.();
      }
      store._subscriptions!.forEach((callback) => callback(...args));
    });
  });
  const destroy = () => {
    cancelReadySubscription();
    instancesMap.delete(state);
    stopWatch?.();
  };
  store._destroyers!.add(destroy);
};

/**
 * Bind a store to Pinia
 */
export const bindPinia = createBinder({
  handleStore,
  handleState: ((options: DefineStoreOptions<any, any, any, any>) => {
    const descriptors: Record<string, PropertyDescriptor> = {};
    options.getters = options.getters ?? {};
    for (const key of Object.keys(options.getters)) {
      const getter = options.getters[key];
      if (typeof getter !== 'function') {
        continue;
      }
      descriptors[key] = {
        get() {
          return getter.call(this, this);
        }
      };
    }
    const rawState = Object.defineProperties(
      {
        ...options.state?.(),
        ...options.actions
      },
      descriptors
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    return {
      copyState: options as any,
      key: 'actions',
      bind: (state: any) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }) as any
}) as <
  Id extends string,
  S extends StateTree = {},
  G extends _GettersTree<S> = {},
  A = {}
>(
  options: Omit<DefineStoreOptions<Id, S, G, A>, 'id'>
) => Omit<DefineStoreOptions<Id, S, G, A>, 'id'>;

/**
 * Adapt a store type to Pinia
 */
export const adapt = <T extends object>(
  store: StoreDefinition<IStore<T>[0], IStore<T>[1], IStore<T>[2], IStore<T>[3]>
) => store as any as T;

export type PiniaStore<T extends object> = StoreDefinition<
  IStore<T>[0],
  IStore<T>[1],
  IStore<T>[2],
  IStore<T>[3]
>;
