import { apply } from 'mutability';
import { createBinder, type Store } from 'coaction';
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
    };
  }
  const mutableStore = internal.toMutableRaw(state);
  if (!mutableStore) {
    throw new Error('Pinia store instance is not found');
  }
  const stopWatch = mutableStore.$subscribe((...args: unknown[]) => {
    store._subscriptions!.forEach((callback) => callback(...args));
  });
  const destroy = () => {
    instancesMap.delete(state);
    stopWatch();
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
