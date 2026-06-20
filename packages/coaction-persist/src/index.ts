import {
  onStoreReady,
  replaceOwnEnumerable,
  type Middleware,
  type Store
} from 'coaction';

export type PersistStorage = {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
};

export type StorageValue<T> = {
  state: T;
  version?: number;
};

type NonFunctionPropertyNames<T extends object> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

export type PureState<T extends object> = Pick<T, NonFunctionPropertyNames<T>>;

export type PersistOptions<T extends object> = {
  name: string;
  storage?: PersistStorage;
  partialize?: (state: T) => object;
  serialize?: (state: StorageValue<object>) => string;
  deserialize?: (state: string) => StorageValue<object>;
  version?: number;
  migrate?: (
    persistedState: object,
    version: number
  ) => object | Promise<object>;
  merge?: (persistedState: object, currentState: PureState<T>) => object;
  skipHydration?: boolean;
  onRehydrateStorage?: (state?: T, error?: unknown) => void;
};

type PersistApi = {
  rehydrate: () => Promise<void>;
  clearStorage: () => Promise<void>;
  hasHydrated: () => boolean;
};

const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
};

const createNoopStorage = (): PersistStorage => ({
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
});

export const createJSONStorage = (
  getStorage: () => Storage | undefined
): PersistStorage => ({
  getItem: (name) => getStorage()?.getItem(name) ?? null,
  setItem: (name, value) => {
    getStorage()?.setItem(name, value);
  },
  removeItem: (name) => {
    getStorage()?.removeItem(name);
  }
});

export const persist =
  <T extends object>({
    name,
    storage = createJSONStorage(() =>
      typeof localStorage !== 'undefined' ? localStorage : undefined
    ),
    partialize = (state: T) => state,
    version = 0,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    merge = (persistedState, currentState) =>
      Object.assign({}, currentState, persistedState),
    migrate,
    skipHydration = false,
    onRehydrateStorage
  }: PersistOptions<T>): Middleware<T> =>
  (store: Store<T>) => {
    const persistedStorage = storage ?? createNoopStorage();
    let hasHydrated = false;
    let isHydrating = false;
    let hydrationPromise: Promise<void> | null = null;
    let destroyed = false;
    let hasPendingPersist = false;
    let writePromise: Promise<void> = Promise.resolve();
    const enqueuePersistOperation = (operation: () => void | Promise<void>) => {
      writePromise = writePromise
        .catch(() => undefined)
        .then(async () => operation());
      return writePromise;
    };
    const enqueuePersistWrite = (payload: string) =>
      enqueuePersistOperation(() => persistedStorage.setItem(name, payload));
    const applyHydratedState = (nextState: T) => {
      if (store.share === 'main') {
        store.setState((draft: any) => {
          replaceOwnEnumerable(
            draft,
            nextState as Record<PropertyKey, unknown>
          );
        });
        return;
      }
      store.apply(nextState);
    };
    const persistState = async () => {
      if (isHydrating || destroyed) {
        return;
      }
      if (!skipHydration && !hasHydrated) {
        hasPendingPersist = true;
        return;
      }
      const partialState = partialize(store.getPureState());
      const payload = serialize({
        state: partialState,
        version
      });
      await enqueuePersistWrite(payload);
    };
    const runRehydrate = async () => {
      if (destroyed) {
        return;
      }
      isHydrating = true;
      try {
        const rawState = await persistedStorage.getItem(name);
        if (destroyed) {
          return;
        }
        if (!rawState) {
          hasHydrated = true;
          onRehydrateStorage?.(store.getState());
          return;
        }
        const parsed = deserialize(rawState);
        const shouldWriteBack = parsed.version !== version;
        let persistedState = parsed.state;
        if (
          parsed.version !== undefined &&
          parsed.version !== version &&
          migrate
        ) {
          persistedState = await migrate(parsed.state, parsed.version);
          if (destroyed) {
            return;
          }
        }
        applyHydratedState(merge(persistedState, store.getPureState()) as T);
        if (shouldWriteBack && !destroyed) {
          const payload = serialize({
            state: partialize(store.getPureState()),
            version
          });
          await enqueuePersistWrite(payload);
        }
        hasHydrated = true;
        onRehydrateStorage?.(store.getState());
      } catch (error) {
        if (destroyed) {
          return;
        }
        hasHydrated = true;
        onRehydrateStorage?.(undefined, error);
      } finally {
        isHydrating = false;
        if (hasPendingPersist && !destroyed) {
          hasPendingPersist = false;
          await persistState().catch((error) => {
            if (process.env.NODE_ENV === 'development') {
              console.error(error);
            }
          });
        }
      }
    };
    const rehydrate = () => {
      if (!hydrationPromise) {
        hydrationPromise = runRehydrate().finally(() => {
          hydrationPromise = null;
        });
      }
      return hydrationPromise;
    };
    const clearStorage = async () => {
      await enqueuePersistOperation(() => persistedStorage.removeItem(name));
    };
    let isSetStatePersisting = false;
    let unsubscribeStore: (() => void) | undefined;
    const persistAfterChange = () => {
      void persistState().catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error(error);
        }
      });
    };
    const cancelReadySubscription = onStoreReady(store, () => {
      unsubscribeStore = store.subscribe(() => {
        if (isSetStatePersisting) {
          return;
        }
        persistAfterChange();
      });
    });
    const baseSetState = store.setState;
    store.setState = (next, updater) => {
      isSetStatePersisting = true;
      let result: ReturnType<typeof baseSetState>;
      try {
        result = baseSetState(next, updater);
      } finally {
        isSetStatePersisting = false;
      }
      persistAfterChange();
      return result;
    };
    const persistApi: PersistApi = {
      rehydrate,
      clearStorage,
      hasHydrated: () => hasHydrated
    };
    Object.assign(store, {
      persist: persistApi
    });
    const baseDestroy = store.destroy;
    store.destroy = () => {
      destroyed = true;
      cancelReadySubscription();
      unsubscribeStore?.();
      baseDestroy();
    };
    if (!skipHydration) {
      scheduleMicrotask(() => {
        if (!destroyed) {
          void rehydrate();
        }
      });
    }
    return store;
  };
