export { createBinder, defineExternalStoreAdapter } from './src/binder';
export type { ExternalStoreAdapterOptions } from './src/binder';
export {
  applyMutableAdapterPatches,
  getMutableAdapterOwnEnumerableKeys,
  isEqualMutableAdapterSnapshot,
  isMutableAdapterUnsafeKey,
  replaceMutableAdapterState,
  snapshotMutableAdapterPureState,
  toMutableAdapterSnapshot
} from './src/externalMutableAdapterUtils';
export { createReactiveTracker } from './src/reactiveTracker';
export type { ReactiveTracker } from './src/reactiveTracker';
export { onStoreReady } from './src/lifecycle';
export { replaceExternalStoreState } from './src/replaceExternalStoreState';
export {
  applyRootReplacementWithPatches,
  createRootReplacementPatches,
  isStateSchemaError,
  replaceOwnEnumerable,
  sanitizeInitialStateValue,
  sanitizeReplacementState,
  StateSchemaError
} from './src/utils';
export { wrapStore } from './src/wrapStore';

export type {
  CreateState,
  Middleware,
  MiddlewareStore,
  PatchTransform,
  Store,
  StoreTraceEvent
} from './src/interface';
