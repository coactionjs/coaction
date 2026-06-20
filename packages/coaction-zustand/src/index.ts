import {
  type Store,
  createBinder,
  replaceExternalStoreState,
  replaceOwnEnumerable
} from 'coaction';
import type { StateCreator, StoreApi } from 'zustand';

type BindZustand = <T>(
  initializer: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

type StoreWithDestroyers = Store<object> & {
  _destroyers?: Set<() => void>;
};

/**
 * Bind a store to Zustand
 */
export const bindZustand = ((initializer: StateCreator<any, [], []>) =>
  (set, get, zustandStore) => {
    let coactionStore: StoreWithDestroyers | undefined;
    let replaceBoundCoactionState:
      | ((nextState: Record<PropertyKey, unknown>) => void)
      | undefined;
    const internalBindZustand = createBinder<BindZustand>({
      handleStore: (store, rawState, state, internal) => {
        const boundStore = store as StoreWithDestroyers;
        coactionStore = boundStore;
        if (!boundStore._destroyers) {
          boundStore._destroyers = new Set();
          const baseDestroy = boundStore.destroy;
          boundStore.destroy = () => {
            boundStore._destroyers?.forEach((destroy) => destroy());
            boundStore._destroyers?.clear();
            boundStore._destroyers = undefined;
            baseDestroy();
          };
        }
        if (zustandStore.getState() === internal.rootState) return;
        let isCoactionUpdated = false;
        internal.rootState = zustandStore.getState() as object;
        const replaceRootState = (nextState: object) => {
          const nextRootState = {};
          replaceOwnEnumerable(
            nextRootState,
            nextState as Record<PropertyKey, unknown>
          );
          internal.rootState = nextRootState;
        };
        const replaceCoactionState = (
          nextState: object,
          syncImmutable = false
        ) => {
          replaceExternalStoreState(
            boundStore,
            internal,
            nextState as Record<PropertyKey, unknown>,
            {
              syncImmutable
            }
          );
        };
        replaceBoundCoactionState = (nextState) => {
          replaceCoactionState(nextState, true);
        };
        const mergeWithCurrentActions = (state: object) => {
          const nextState = {};
          replaceOwnEnumerable(
            nextState,
            state as Record<PropertyKey, unknown>
          );
          const currentState = zustandStore.getState() as Record<
            PropertyKey,
            unknown
          >;
          for (const key of Reflect.ownKeys(currentState)) {
            if (
              Object.prototype.propertyIsEnumerable.call(currentState, key) &&
              typeof currentState[key] === 'function'
            ) {
              (nextState as Record<PropertyKey, unknown>)[key] =
                currentState[key];
            }
          }
          return nextState;
        };
        const unsubscribe = zustandStore.subscribe(() => {
          if (!isCoactionUpdated) {
            const nextState = zustandStore.getState() as object;
            if (boundStore.share === 'client') {
              replaceRootState(nextState);
              internal.notifyStateChange();
              throw new Error('client zustand store cannot be updated');
            } else if (boundStore.share === 'main') {
              // emit to all clients
              replaceCoactionState(nextState);
              return;
            }
            replaceCoactionState(nextState);
            return;
          }
          internal.notifyStateChange();
        });
        boundStore._destroyers.add(() => {
          unsubscribe();
          replaceBoundCoactionState = undefined;
        });
        internal.updateImmutable = (state: any) => {
          isCoactionUpdated = true;
          try {
            (zustandStore.setState as (state: object, replace: true) => void)(
              mergeWithCurrentActions(state),
              true
            );
          } finally {
            isCoactionUpdated = false;
          }
        };
      },
      handleState: (externalState) => {
        return {
          copyState: externalState,
          bind: (state) => state
        };
      }
    });
    const state = initializer(
      (...args) => {
        const [state, replace] = args;
        if (!coactionStore) {
          (set as (...args: any[]) => void)(...args);
          return;
        }
        if (replace) {
          const nextState =
            typeof state === 'function'
              ? state(coactionStore.getState())
              : state;
          if (coactionStore.share === 'main' && replaceBoundCoactionState) {
            replaceBoundCoactionState(
              nextState as Record<PropertyKey, unknown>
            );
            return;
          }
          coactionStore.apply(nextState as any);
          return;
        }
        coactionStore.setState(state as any);
      },
      () => (coactionStore ? coactionStore.getState() : get()),
      zustandStore
    );
    return internalBindZustand(state);
  }) as BindZustand;

/**
 * Adapt a store type to Pinia
 */
export const adapt = <T extends object>(store: StoreApi<T>) =>
  store as unknown as T;
