import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import { sanitizeCheckedPatches } from './utils';

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
  if (safePatches.length) {
    store.apply(internal.rootState as T, safePatches);
    internal.emitPatches?.(safePatches);
  }
};
