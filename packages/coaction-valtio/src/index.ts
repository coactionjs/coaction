import { apply } from 'mutability';
import { createBinder, type Store } from 'coaction';
import { proxy, subscribe } from 'valtio/vanilla';

export * from 'valtio/vanilla';

const instancesMap = new WeakMap<object, object>();

type ValtioInternal = {
  rootState?: object;
  toMutableRaw?: (key: object) => object | undefined;
};

type StoreWithDestroyers = Store<object> & {
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

const handleStore = (
  store: StoreWithDestroyers,
  rawState: object,
  state: object,
  internal: ValtioInternal
) => {
  if (!internal.toMutableRaw) {
    internal.toMutableRaw = (key: object) => instancesMap.get(key);
    const getMutableState = () => internal.toMutableRaw?.(rawState) ?? rawState;
    store._destroyers = new Set();
    Object.assign(store, {
      subscribe: (listener: () => void) => {
        const unsubscribe = subscribe(getMutableState(), listener);
        store._destroyers!.add(unsubscribe);
        return () => {
          unsubscribe();
          store._destroyers?.delete(unsubscribe);
        };
      }
    });
    const baseDestroy = store.destroy;
    store.destroy = () => {
      store._destroyers?.forEach((destroy) => destroy());
      store._destroyers?.clear();
      store._destroyers = undefined;
      baseDestroy();
    };
    store.apply = (state = store.getState(), patches) => {
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
