export { create } from './create';
export { createBinder, defineExternalStoreAdapter } from './binder';
export { onStoreReady } from './lifecycle';
export { createReactiveTracker } from './reactiveTracker';
export { replaceExternalStoreState } from './replaceExternalStoreState';
export {
  applyMutableAdapterPatches,
  getMutableAdapterOwnEnumerableKeys,
  isEqualMutableAdapterSnapshot,
  isMutableAdapterUnsafeKey,
  replaceMutableAdapterState,
  snapshotMutableAdapterPureState,
  toMutableAdapterSnapshot
} from './externalMutableAdapterUtils';
export {
  assertSafePatches,
  createRootReplacementPatches,
  isStateSchemaError,
  replaceOwnEnumerable,
  sanitizeInitialStateValue,
  sanitizePatches,
  sanitizeReplacementState,
  StateSchemaError,
  UnsafePatchPathError
} from './utils';
export { wrapStore } from './wrapStore';
export {
  computed,
  effect,
  effectScope,
  signal,
  trigger,
  isComputed,
  isEffect,
  isEffectScope,
  isSignal,
  startBatch,
  endBatch
} from 'alien-signals';

export type {
  Store,
  MiddlewareStore,
  StoreOptions,
  ISlices,
  Slice,
  Slices,
  Middleware,
  PatchTransform,
  StoreTraceEvent,
  ClientStoreOptions,
  SliceState,
  Asyncify,
  StoreWithAsyncFunction as AsyncStore
} from './interface';

export type { ExternalStoreAdapterOptions } from './binder';
export type { ReactiveTracker } from './reactiveTracker';
