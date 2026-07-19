import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import { sanitizeCheckedPatches } from './utils';
import { publishStoreCommit } from './storeCommit';

export const handleDraft = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>
) => {
  internal.rootState = internal.backupState;
  const [, patches, inversePatches] = internal.finalizeDraft();
  const finalPatches = store.patch
    ? store.patch({ patches, inversePatches })
    : { patches, inversePatches };
  const safePatches = sanitizeCheckedPatches(
    finalPatches.patches,
    'store.patch()'
  );
  const safeInversePatches = sanitizeCheckedPatches(
    finalPatches.inversePatches,
    'store.patch() inverse patches'
  );
  if (safePatches.length) {
    store.apply(internal.rootState as T, safePatches);
    internal.emitPatches?.(safePatches);
    publishStoreCommit(store, {
      state: internal.rootState as T,
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: 'mutableAction'
    });
  }
};
