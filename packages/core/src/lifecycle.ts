import type { CreateState, Store } from './interface';

const readyStores = new WeakSet<Store<any>>();
const readyCallbacks = new WeakMap<Store<any>, Set<() => void>>();

export const onStoreReady = <T extends CreateState>(
  store: Store<T>,
  callback: () => void
) => {
  if (readyStores.has(store)) {
    callback();
    return () => undefined;
  }
  let callbacks = readyCallbacks.get(store);
  if (!callbacks) {
    callbacks = new Set();
    readyCallbacks.set(store, callbacks);
  }
  callbacks.add(callback);
  return () => {
    callbacks?.delete(callback);
  };
};

export const markStoreReady = <T extends CreateState>(store: Store<T>) => {
  readyStores.add(store);
  const callbacks = readyCallbacks.get(store);
  if (!callbacks) {
    return;
  }
  readyCallbacks.delete(store);
  callbacks.forEach((callback) => callback());
  callbacks.clear();
};
