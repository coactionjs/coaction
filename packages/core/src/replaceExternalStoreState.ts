import { create as createWithMutative, type Patches } from 'mutative';
import { emit } from './asyncClientStore';
import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import { replaceOwnEnumerable, sanitizeCheckedPatches } from './utils';

type ReplaceExternalStoreStateOptions = {
  syncImmutable?: boolean;
};

export const replaceExternalStoreState = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  source: Record<PropertyKey, unknown>,
  { syncImmutable = true }: ReplaceExternalStoreStateOptions = {}
) => {
  const [nextState, patches, inversePatches] = createWithMutative(
    internal.rootState,
    (draft) => {
      replaceOwnEnumerable(draft as Record<PropertyKey, unknown>, source);
    },
    {
      enablePatches: true
    }
  ) as [T, Patches, Patches];
  internal.validateState?.(nextState);
  const finalPatches = store.patch
    ? store.patch({ patches, inversePatches })
    : { patches, inversePatches };
  const safePatches = sanitizeCheckedPatches(
    finalPatches.patches,
    'store.patch()'
  );
  if (!safePatches.length) {
    return;
  }
  const updateImmutable = internal.updateImmutable;
  if (!syncImmutable) {
    internal.updateImmutable = undefined;
  }
  try {
    store.apply(internal.rootState as T, safePatches);
  } finally {
    internal.updateImmutable = updateImmutable;
  }
  emit(store, internal, safePatches);
};
