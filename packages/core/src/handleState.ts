import {
  type Draft,
  create as createWithMutative,
  isDraft,
  Patches
} from 'mutative';
import type {
  ClientStoreOptions,
  CreateState,
  MiddlewareStore,
  Store,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import {
  assertKnownStateShape,
  cloneOwnEnumerable,
  getOwnEnumerableKeys,
  mergeObject,
  sanitizePatches,
  setOwnEnumerable
} from './utils';
import { emit, handleDraft } from './asyncClientStore';
import { Computed, refreshSignalSlots } from './computed';
import { validateSharedStateSerializable } from './sharedState';

export const handleState = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  options: StoreOptions<T> | ClientStoreOptions<T>
): {
  setState: Store['setState'];
  getState: Store['getState'];
} => {
  const setState: Store['setState'] = (
    next,
    updater = (next) => {
      const merge = (_next = next) => {
        mergeObject(internal.rootState, _next, store.isSliceStore);
      };
      const fn =
        typeof next === 'function'
          ? () => {
              const returnValue = next(internal.module);
              if (returnValue instanceof Promise) {
                returnValue.catch(() => undefined);
                throw new Error(
                  'setState with async function is not supported'
                );
              }
              if (typeof returnValue === 'object' && returnValue !== null) {
                merge(returnValue);
              }
            }
          : merge;
      const enablePatches =
        store.transport ?? (options as StoreOptions<T>).enablePatches;
      if (!enablePatches && internal.mutableInstance) {
        if (internal.actMutable) {
          internal.actMutable(() => {
            fn.apply(null);
          });
          return [];
        }
        fn.apply(null);
        return [];
      }
      internal.backupState = internal.rootState;
      let patches: Patches;
      let inversePatches: Patches;
      try {
        const result = createWithMutative(
          internal.rootState,
          (draft) => {
            internal.rootState = draft as Draft<T>;
            return fn.apply(null);
          },
          {
            enablePatches: true
          }
        );
        assertKnownStateShape(
          result[0],
          internal.backupState,
          internal.stateSchema,
          store.isSliceStore
        );
        if (store.share === 'main') {
          validateSharedStateSerializable(result[0]);
        }
        patches = result[1];
        inversePatches = result[2];
      } finally {
        internal.rootState = internal.backupState;
      }
      const finalPatches = store.patch
        ? store.patch({ patches, inversePatches })
        : { patches, inversePatches };
      const safePatches = sanitizePatches(finalPatches.patches) ?? [];
      const safeInversePatches =
        sanitizePatches(finalPatches.inversePatches) ?? [];
      if (safePatches.length) {
        store.apply(internal.rootState as T, safePatches);
      }
      return [internal.rootState as any, safePatches, safeInversePatches];
    }
  ) => {
    internal.assertMutationAllowed?.('setState');
    if (store.share === 'client') {
      throw new Error(
        `setState() cannot be called in the client store. To update the state, please trigger a store method with setState() instead.`
      );
    }
    if (internal.isBatching) {
      throw new Error('setState cannot be called within the updater');
    }
    if (next === null) {
      return [];
    }
    if (typeof next === 'object') {
      assertKnownStateShape(
        next,
        internal.rootState,
        internal.stateSchema,
        store.isSliceStore
      );
    }
    internal.isBatching = true;
    if (
      !store.share &&
      !(options as StoreOptions<T>).enablePatches &&
      !internal.mutableInstance
    ) {
      try {
        if (typeof next === 'function') {
          try {
            internal.backupState = internal.rootState;
            const nextState = createWithMutative(
              internal.rootState,
              (draft) => {
                internal.rootState = draft as Draft<T>;
                const returnValue = next(internal.module);
                if (returnValue instanceof Promise) {
                  returnValue.catch(() => undefined);
                  throw new Error(
                    'setState with async function is not supported'
                  );
                }
                if (typeof returnValue === 'object' && returnValue !== null) {
                  mergeObject(
                    internal.rootState,
                    returnValue,
                    store.isSliceStore
                  );
                }
              }
            );
            assertKnownStateShape(
              nextState,
              internal.backupState,
              internal.stateSchema,
              store.isSliceStore
            );
            internal.rootState = nextState;
          } catch (error) {
            internal.rootState = internal.backupState;
            throw error;
          }
        } else {
          const copy = cloneOwnEnumerable(internal.rootState as T);
          if (store.isSliceStore) {
            const nextRecord = next as Record<PropertyKey, unknown>;
            const copyRecord = copy as Record<PropertyKey, unknown>;
            for (const key of getOwnEnumerableKeys(nextRecord)) {
              if (!Object.prototype.hasOwnProperty.call(copyRecord, key)) {
                continue;
              }
              const sourceValue = nextRecord[key];
              if (typeof sourceValue !== 'object' || sourceValue === null) {
                continue;
              }
              const targetValue = copyRecord[key];
              if (typeof targetValue !== 'object' || targetValue === null) {
                continue;
              }
              const sliceCopy = cloneOwnEnumerable(
                targetValue as Record<PropertyKey, unknown>
              );
              mergeObject(sliceCopy, sourceValue);
              setOwnEnumerable(copyRecord, key, sliceCopy);
            }
          } else {
            mergeObject(copy, next);
          }
          assertKnownStateShape(
            copy,
            internal.rootState,
            internal.stateSchema,
            store.isSliceStore
          );
          internal.rootState = copy;
        }
        refreshSignalSlots(internal);
        if (internal.updateImmutable) {
          internal.updateImmutable(internal.rootState as T);
        } else {
          internal.listeners.forEach((listener) => listener());
        }
        return [];
      } finally {
        internal.isBatching = false;
      }
    }
    let result: void | [] | [any, Patches, Patches];
    try {
      const isDrafted = internal.mutableInstance && isDraft(internal.rootState);
      if (isDrafted) {
        handleDraft(store, internal);
      }
      result = updater(next);
      if (internal.mutableInstance) {
        assertKnownStateShape(
          internal.rootState,
          internal.backupState ?? internal.rootState,
          internal.stateSchema,
          store.isSliceStore
        );
      }
      if (store.share === 'main') {
        validateSharedStateSerializable(internal.rootState);
      }
      if (isDrafted) {
        internal.backupState = internal.rootState;
        const [draft, finalize] = createWithMutative(
          internal.rootState as any,
          {
            enablePatches: true
          }
        );
        internal.finalizeDraft = finalize;
        internal.rootState = draft;
      }
    } finally {
      internal.isBatching = false;
    }
    if (result?.length) {
      result = [
        result[0],
        sanitizePatches(result[1]) ?? [],
        sanitizePatches(result[2]) ?? []
      ];
    }
    emit(store, internal, result?.[1]);
    return result;
  };
  const getState = (
    deps?: (...args: any) => any,
    selector?: (...args: any) => any
  ) => (deps && selector ? new Computed(deps, selector) : internal.module);
  return { setState, getState };
};
