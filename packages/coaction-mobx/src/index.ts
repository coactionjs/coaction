import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';
import { autorun, runInAction, untracked } from 'mobx';

const instancesMap = new WeakMap<object, object>();

type StoreWithSubscriptions = Store<object> & {
  _subscriptions?: Set<() => void>;
};

type MobxInternal = {
  rootState?: object;
  toMutableRaw?: (key: object) => object | undefined;
  actMutable?: typeof runInAction;
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
  Object.assign(store, {
    subscribe: (listener: () => void) => {
      let isInitialRun = true;
      const unsubscribe = autorun(() => {
        touchObservableTree(state);
        if (isInitialRun) {
          isInitialRun = false;
          return;
        }
        untracked(listener);
      });
      store._subscriptions!.add(unsubscribe);
      return () => {
        unsubscribe();
        store._subscriptions?.delete(unsubscribe);
      };
    }
  });
  const baseDestroy = store.destroy;
  store.destroy = () => {
    store._subscriptions?.forEach((unsubscribe) => unsubscribe());
    store._subscriptions?.clear();
    store._subscriptions = undefined;
    baseDestroy();
  };
  internal.actMutable = runInAction;
  store.apply = (state = store.getState(), patches) => {
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
