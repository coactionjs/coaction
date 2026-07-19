import type { CreateState, Store } from './interface';

type Disposable = { dispose?: () => void } | undefined;
type Destroyable = { destroy?: () => void };

export const reportLifecycleError = (error: unknown) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(error);
  }
};

const tryDestroyStore = (store: Destroyable) => {
  try {
    store.destroy?.();
  } catch (error) {
    reportLifecycleError(error);
  }
};

export const failStoreSetup = (store: Destroyable, error: unknown): never => {
  tryDestroyStore(store);
  throw error;
};

export const failTransportInitialization = (
  transport: Disposable,
  error: unknown
): never => {
  try {
    transport?.dispose?.();
  } catch (disposeError) {
    reportLifecycleError(disposeError);
  }
  throw error;
};

type StoreReadyRuntime = {
  callbacks: Set<() => void>;
  ready: boolean;
};

const storeReadyRuntimeSymbol = Symbol.for('coaction.lifecycle.ready');

const getStoreReadyRuntime = (store: Store<any>, create = false) => {
  const target = store as unknown as Record<PropertyKey, unknown>;
  const existing = target[storeReadyRuntimeSymbol] as
    | StoreReadyRuntime
    | undefined;
  if (existing || !create) {
    return existing;
  }
  const runtime: StoreReadyRuntime = {
    callbacks: new Set(),
    ready: false
  };
  Object.defineProperty(target, storeReadyRuntimeSymbol, {
    configurable: true,
    enumerable: true,
    value: runtime,
    writable: true
  });
  return runtime;
};

export const onStoreReady = <T extends CreateState>(
  store: Store<T>,
  callback: () => void
) => {
  const runtime = getStoreReadyRuntime(store, true)!;
  if (runtime.ready) {
    callback();
    return () => undefined;
  }
  runtime.callbacks.add(callback);
  return () => {
    runtime.callbacks.delete(callback);
  };
};

export const markStoreReady = <T extends CreateState>(store: Store<T>) => {
  const runtime = getStoreReadyRuntime(store, true)!;
  if (runtime.ready) {
    return;
  }
  runtime.ready = true;
  const callbacks = [...runtime.callbacks];
  runtime.callbacks.clear();
  callbacks.forEach((callback) => callback());
};
