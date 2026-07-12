import { apply as applyWithMutative } from 'mutative';
import { applyMiddlewares } from './applyMiddlewares';
import { refreshSignalSlots } from './computed';
import { defaultName } from './constant';
import { getInitialState } from './getInitialState';
import { getRawState } from './getRawState';
import type { ClientActionFactory } from './getRawStateClientAction';
import { handleState } from './handleState';
import type {
  ClientStoreOptions,
  CreateState,
  Listener,
  MiddlewareStore,
  Slice,
  Store,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import { markStoreReady } from './lifecycle';
import {
  assertKnownStateShape,
  assertSafePatches,
  createStateSchema,
  getOwnEnumerableKeys,
  sanitizePatches,
  sanitizeReplacementState
} from './utils';

type Options<T extends CreateState> = StoreOptions<T> | ClientStoreOptions<T>;

type StoreRuntime = {
  clientAction?: ClientActionFactory;
  collectActionPaths?: (state: unknown, isSliceStore: boolean) => Set<string>;
  share?: 'client' | 'main';
  validateInitialState?: (state: unknown, isSliceStore: boolean) => void;
  validateState?: (state: unknown) => void;
};

const namespaceMap = new Map<string, boolean>();
let hasWarnedAmbiguousFunctionMap = false;

const warnAmbiguousFunctionMap = () => {
  if (
    hasWarnedAmbiguousFunctionMap ||
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
  hasWarnedAmbiguousFunctionMap = true;
  console.warn(
    [
      `sliceMode: 'auto' inferred slices from an object of functions.`,
      `This shape is ambiguous with a single store that only contains methods.`,
      `Use create({ ping() {} }, { sliceMode: 'single' }) for a plain method store,`,
      `or create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' }) for slices.`
    ].join(' ')
  );
};

export const createStore = <T extends CreateState>(
  createState: Slice<T> | T,
  options: Options<T>,
  runtime: StoreRuntime = {}
) => {
  const { share, validateState } = runtime;
  const store = {} as MiddlewareStore<T>;
  const internal = {
    sequence: 0,
    isBatching: false,
    listeners: new Set<Listener>(),
    destroyCallbacks: new Set<() => void>(),
    validateState
  } as Internal<T>;
  internal.notifyStateChange = () => {
    refreshSignalSlots(internal);
    internal.listeners.forEach((listener) => listener());
  };
  const name = options.name ?? defaultName;
  const shouldTrackName = share === 'main' && process.env.NODE_ENV !== 'test';
  const releaseStoreName = () => {
    if (shouldTrackName) {
      namespaceMap.delete(name);
    }
  };
  if (shouldTrackName) {
    if (namespaceMap.get(name)) {
      throw new Error(`Store name '${name}' is not unique.`);
    }
    namespaceMap.set(name, true);
  }

  try {
    const { setState, getState } = handleState(store, internal, options);
    const subscribe: Store<T>['subscribe'] = (listener) => {
      internal.assertAlive?.('subscribe');
      internal.listeners.add(listener);
      return () => internal.listeners.delete(listener);
    };
    let isDestroyed = false;
    internal.assertAlive = (operation) => {
      if (isDestroyed) {
        throw new Error(`${operation} cannot be called after store.destroy().`);
      }
    };
    const destroy: Store<T>['destroy'] = () => {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      let firstError: unknown;
      const callbacks = [...(internal.destroyCallbacks ?? [])];
      internal.destroyCallbacks?.clear();
      for (const callback of callbacks) {
        try {
          callback();
        } catch (error) {
          firstError ??= error;
        }
      }
      internal.listeners.clear();
      try {
        store.transport?.dispose();
      } catch (error) {
        firstError ??= error;
      } finally {
        releaseStoreName();
      }
      if (firstError) {
        throw firstError;
      }
    };
    const apply: Store<T>['apply'] = (
      state = internal.rootState as T,
      patches
    ) => {
      internal.assertAlive?.('apply');
      internal.assertMutationAllowed?.('apply');
      assertSafePatches(patches, 'store.apply()');
      const safePatches = sanitizePatches(patches);
      const baseState =
        state === (internal.module as unknown) ? internal.rootState : state;
      const nextState = sanitizeReplacementState(
        safePatches
          ? (applyWithMutative(baseState, safePatches) as T)
          : baseState
      );
      assertKnownStateShape(
        nextState,
        internal.rootState,
        internal.stateSchema,
        store.isSliceStore,
        {
          requireSliceRoots: true
        }
      );
      validateState?.(internal.getTransportState?.() ?? nextState);
      internal.rootState = nextState;
      refreshSignalSlots(internal);
      if (internal.updateImmutable) {
        internal.updateImmutable(internal.rootState as T);
      } else {
        internal.listeners.forEach((listener) => listener());
      }
    };
    const getPureState: Store<T>['getPureState'] = () =>
      internal.rootState as T;
    const isFunctionMapObject = () => {
      if (typeof createState !== 'object' || createState === null) {
        return false;
      }
      const values = getOwnEnumerableKeys(createState).map(
        (key) => (createState as Record<PropertyKey, unknown>)[key]
      );
      return (
        values.length > 0 &&
        values.every((value) => typeof value === 'function')
      );
    };
    const getIsSliceStore = () => {
      const sliceMode = options.sliceMode ?? 'auto';
      if (sliceMode === 'single') {
        return false;
      }
      if (sliceMode === 'slices') {
        if (!isFunctionMapObject()) {
          throw new Error(
            `sliceMode: 'slices' requires createState to be an object of slice functions.`
          );
        }
        return true;
      }
      if (isFunctionMapObject()) {
        warnAmbiguousFunctionMap();
        return true;
      }
      return false;
    };
    const isSliceStore = getIsSliceStore();
    Object.assign(store, {
      name,
      share: share ?? false,
      setState,
      getState,
      subscribe,
      destroy,
      apply,
      isSliceStore,
      getPureState
    } as Store<T>);
    const middlewareStore = applyMiddlewares(store, options.middlewares ?? []);
    if (middlewareStore !== store) {
      Object.assign(store, middlewareStore);
    }
    const initialState = getInitialState(store, createState, internal) as T;
    internal.sharedActionPaths = runtime.collectActionPaths?.(
      initialState,
      store.isSliceStore
    );
    if (!internal.getTransportState) {
      runtime.validateInitialState?.(initialState, store.isSliceStore);
    }
    store.getInitialState = () => initialState;
    internal.rootState = getRawState(
      store,
      internal,
      initialState,
      options,
      runtime.clientAction
    ) as T;
    internal.stateSchema = createStateSchema(
      internal.rootState,
      store.isSliceStore
    );
    validateState?.(internal.getTransportState?.() ?? internal.rootState);
    markStoreReady(store);
    return { store, internal };
  } catch (error) {
    try {
      store.destroy?.();
    } catch (destroyError) {
      if (process.env.NODE_ENV === 'development') {
        console.error(destroyError);
      }
    }
    releaseStoreName();
    throw error;
  }
};
