export { create } from './src/create';
export { createLocal } from './src/createLocal';
export { createBinder, defineExternalStoreAdapter } from './src/binder';
export { createReactiveTracker } from './src/reactiveTracker';
export { wrapStore } from './src/wrapStore';
export {
  computed,
  effect,
  effectScope,
  endBatch,
  isComputed,
  isEffect,
  isEffectScope,
  isSignal,
  signal,
  startBatch,
  trigger
} from 'alien-signals';

export type { ExternalStoreAdapterOptions } from './src/binder';
export type { ReactiveTracker } from './src/reactiveTracker';

export type {
  Asyncify,
  ClientStoreOptions,
  LocalCreator,
  LocalStoreOptions,
  ISlices,
  Middleware,
  MiddlewareStore,
  PatchTransform,
  Slice,
  SliceState,
  Slices,
  Store,
  StoreOptions,
  StoreTraceEvent,
  TransportPolicy,
  TransportPolicyRequest,
  StoreWithAsyncFunction as AsyncStore
} from './src/interface';
export type { JsonPrimitive, JsonValue } from './src/sharedState';
