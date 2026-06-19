import { type Store, createBinder } from 'coaction';
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
        const unsubscribe = zustandStore.subscribe(() => {
          if (!isCoactionUpdated) {
            const nextState = zustandStore.getState() as object;
            if (boundStore.share === 'client') {
              internal.rootState = nextState;
              throw new Error('client zustand store cannot be updated');
            } else if (boundStore.share === 'main') {
              // emit to all clients
              boundStore.setState(nextState);
              return;
            }
            internal.rootState = nextState;
          }
          internal.notifyStateChange();
        });
        boundStore._destroyers.add(() => {
          unsubscribe();
        });
        internal.updateImmutable = (state: any) => {
          isCoactionUpdated = true;
          try {
            zustandStore.setState(state, true);
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
        const [state] = args;
        if (!coactionStore) {
          (set as (...args: any[]) => void)(...args);
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
