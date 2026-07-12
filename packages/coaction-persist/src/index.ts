import {
  applyRootReplacementWithPatches,
  onStoreReady,
  sanitizeReplacementState,
  type Middleware,
  type Store
} from 'coaction/adapter';

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

const historySuppressionSymbol = Symbol.for('coaction.history.suppress');

const runWithoutHistoryRecording = <R>(
  store: Store<any>,
  callback: () => R
): R => {
  const runner = (store as unknown as Record<symbol, unknown>)[
    historySuppressionSymbol
  ];
  return typeof runner === 'function'
    ? (runner as (callback: () => R) => R)(callback)
    : callback();
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

const createVersionMismatchError = (
  persistedVersion: number,
  currentVersion: number
) =>
  new Error(
    `Persisted state version ${persistedVersion} does not match current version ${currentVersion} and no migrate function was provided. Hydration was skipped.`
  );

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
    if (store.share === 'client') {
      throw new Error(
        'persist() is not supported in client store mode. Apply persist() to the main shared store instead.'
      );
    }
    const persistedStorage = storage ?? createNoopStorage();
    let hasHydrated = false;
    let isHydrating = false;
    let hydrationPromise: Promise<void> | null = null;
    let destroyed = false;
    let hasPendingPersist = false;
    let writePromise: Promise<void> = Promise.resolve();
    const getPersistedState = () =>
      sanitizeReplacementState(partialize(store.getPureState()));
    const enqueuePersistOperation = (operation: () => void | Promise<void>) => {
      writePromise = writePromise
        .catch(() => undefined)
        .then(async () => operation());
      return writePromise;
    };
    const enqueuePersistWrite = (payload: string) =>
      enqueuePersistOperation(() => persistedStorage.setItem(name, payload));
    const reportRehydrateError = (error: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
    };
    const applyHydratedState = (nextState: T) => {
      runWithoutHistoryRecording(store, () => {
        if (store.share === 'main') {
          store.setState(nextState as any, () => {
            return applyRootReplacementWithPatches(
              store,
              nextState as Record<PropertyKey, unknown>
            );
          });
          return;
        }
        store.apply(nextState);
      });
    };
    const persistState = async () => {
      if (isHydrating || destroyed) {
        return;
      }
      if (!skipHydration && !hasHydrated) {
        hasPendingPersist = true;
        return;
      }
      const payload = serialize({
        state: getPersistedState(),
        version
      });
      await enqueuePersistWrite(payload);
    };
    const runRehydrate = async () => {
      if (destroyed) {
        return;
      }
      isHydrating = true;
      let callbackState: T | undefined;
      let callbackError: unknown;
      let shouldNotify = false;
      try {
        const rawState = await persistedStorage.getItem(name);
        if (destroyed) {
          return;
        }
        if (!rawState) {
          hasHydrated = true;
          callbackState = store.getState();
          shouldNotify = true;
        } else {
          const parsed = deserialize(rawState);
          const hasPersistedVersion = parsed.version !== undefined;
          const versionMismatch =
            hasPersistedVersion && parsed.version !== version;
          const shouldWriteBack = parsed.version !== version;
          let persistedState = sanitizeReplacementState(parsed.state);
          if (versionMismatch && !migrate) {
            hasHydrated = true;
            callbackState = store.getState();
            callbackError = createVersionMismatchError(
              parsed.version!,
              version
            );
            shouldNotify = true;
          } else {
            if (versionMismatch && migrate) {
              persistedState = sanitizeReplacementState(
                await migrate(persistedState, parsed.version!)
              );
              if (destroyed) {
                return;
              }
            }
            applyHydratedState(
              sanitizeReplacementState(
                merge(persistedState, store.getPureState())
              ) as T
            );
            if (shouldWriteBack && !destroyed) {
              const payload = serialize({
                state: getPersistedState(),
                version
              });
              await enqueuePersistWrite(payload);
            }
            hasHydrated = true;
            callbackState = store.getState();
            shouldNotify = true;
          }
        }
      } catch (error) {
        if (destroyed) {
          return;
        }
        hasHydrated = true;
        callbackError = error;
        shouldNotify = true;
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
      if (shouldNotify && !destroyed) {
        if (callbackError) {
          onRehydrateStorage?.(callbackState, callbackError);
        } else {
          onRehydrateStorage?.(callbackState);
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
      if (destroyed) {
        return;
      }
      destroyed = true;
      cancelReadySubscription();
      unsubscribeStore?.();
      unsubscribeStore = undefined;
      baseDestroy();
    };
    if (!skipHydration) {
      scheduleMicrotask(() => {
        if (!destroyed) {
          void rehydrate().catch(reportRehydrateError);
        }
      });
    }
    return store;
  };
