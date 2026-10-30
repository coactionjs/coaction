import { bindSymbol } from './constant';
import type { CreateState, ISlices, Slice, Store } from './interface';
import { Internal } from './internal';
import { Computed } from './computed';
import {
  getOwnEnumerableKeys,
  isUnsafeKey,
  sanitizeInitialStateValue,
  setOwnEnumerable,
  type StateCopyMemo
} from './utils';

type StateFactory<T extends CreateState> = (
  setState: Store<T>['setState'],
  getState: Store<T>['getState'],
  store: Store<T>
) => unknown;

type StoreWithGetState = {
  getState: () => unknown;
};

type BoundState = {
  [bindSymbol]?: {
    bind: (state: object) => object;
    handleStore: (
      store: Store<object>,
      rawState: object,
      state: object,
      internal: Internal<object>,
      key?: PropertyKey
    ) => void;
  };
};

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

const isStateFactory = <T extends CreateState>(
  value: unknown
): value is StateFactory<T> => typeof value === 'function';

const hasGetState = (value: unknown): value is StoreWithGetState =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as StoreWithGetState).getState === 'function';

const hasBindState = (value: unknown): value is object & BoundState =>
  isObject(value) && !!(value as BoundState)[bindSymbol];

const formatInvalidStateMessage = (
  type: 'value' | 'result',
  stateOrFn: unknown,
  key?: PropertyKey
) =>
  `Invalid state ${type} encountered in makeState: ${typeof key !== 'undefined' ? `for key ${String(key)}, ` : ''}${typeof stateOrFn}`;

export const getInitialState = <T extends CreateState>(
  store: Store<T>,
  createState: Slice<T> | T,
  internal: Internal<T>
) => {
  const makeState = (
    stateOrFn: StateFactory<T> | object,
    key?: PropertyKey
  ) => {
    let state: unknown;
    if (isStateFactory<T>(stateOrFn)) {
      // It's a slice creator function or a function returning state
      state = stateOrFn(store.setState, store.getState, store);
    } else if (isObject(stateOrFn)) {
      // It's a pre-existing object, potentially a third-party store instance or plain data
      state = stateOrFn;
    } else {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(formatInvalidStateMessage('value', stateOrFn, key));
      }
      return {}; // Return empty object or handle error appropriately
    }

    // Preserve existing logic for unwrapping/handling state:
    // support 3rd party library store like zustand, redux
    if (hasGetState(state)) {
      state = state.getState();
      // support 3rd party library store like pinia
    } else if (typeof state === 'function') {
      // This was for when a slice function returns another function (e.g. Pinia setup store).
      // If stateOrFn was an object, and that object is itself a function, this would call it.
      state = state();
    }
    // support bind store like mobx
    if (hasBindState(state)) {
      if (store.isSliceStore) {
        throw new Error(
          'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
        );
      }
      const binder = state[bindSymbol]!;
      const rawState = binder.bind(state);
      binder.handleStore(
        store as unknown as Store<object>,
        rawState,
        state,
        internal as unknown as Internal<object>,
        key
      );
      delete state[bindSymbol];
      return rawState;
    }
    if (!isObject(state)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(formatInvalidStateMessage('result', state, key));
      }
      return {};
    }
    return state as object;
  };
  if (!store.isSliceStore) {
    return makeState(createState as Slice<any> | object);
  }
  return getOwnEnumerableKeys(createState as object).reduce(
    (stateTree, key) => {
      if (typeof key === 'string' && isUnsafeKey(key)) {
        return stateTree;
      }
      setOwnEnumerable(
        stateTree as Record<PropertyKey, unknown>,
        key,
        makeState((createState as Record<PropertyKey, Slice<any>>)[key], key)
      );
      return stateTree;
    },
    {} as ISlices<Slice<any>>
  );
};

/** The factory's own object, for a store bound to another runtime. */
export const holdInitialState =
  <T>(state: T): (() => T) =>
  () =>
    state;

type InitialShape = {
  prototype: object | null;
  /** The factory's own descriptors, without the values of its data keys. */
  descriptors: Record<PropertyKey, PropertyDescriptor>;
  data: PropertyKey[];
};

const shapeOf = (source: object): InitialShape => {
  const descriptors = Object.getOwnPropertyDescriptors(source) as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  const data: PropertyKey[] = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key === 'string' && isUnsafeKey(key)) {
      delete descriptors[key];
    } else if (
      'value' in descriptor &&
      typeof descriptor.value !== 'function' &&
      !(descriptor.value instanceof Computed)
    ) {
      // The data is the store's root's, not the factory's.
      delete descriptor.value;
      data.push(key);
    }
  }
  return { prototype: Object.getPrototypeOf(source), descriptors, data };
};

const readInitial = (
  { prototype, descriptors, data }: InitialShape,
  root: Record<PropertyKey, unknown>,
  memo: StateCopyMemo
) => {
  for (const key of data) {
    descriptors[key].value = sanitizeInitialStateValue(root[key], memo);
  }
  return Object.create(prototype, descriptors) as object;
};

const sliceShapesOf = (factoryState: object) =>
  getOwnEnumerableKeys(factoryState)
    .filter((key) => !(typeof key === 'string' && isUnsafeKey(key)))
    .map(
      (key) =>
        [
          key,
          shapeOf((factoryState as Record<PropertyKey, object>)[key])
        ] as const
    );

/**
 * Read the initial state from what the store keeps of it.
 *
 * Its data is the store's first root, which the live state shares until it is
 * written; the factory's methods, accessors and computed definitions are kept
 * as they were. Keeping the factory's whole object held its data a second time
 * for the life of the store. The first read copies that root into an object
 * shaped like the factory's, and later reads return the same object, which the
 * store never touches.
 */
export const createInitialStateReader = <T>(
  factoryState: object,
  initialRoot: object,
  isSliceStore: boolean
): (() => T) => {
  const root = initialRoot as Record<PropertyKey, unknown>;
  // Shaped outside this scope: a closure here that saw `factoryState` would
  // share its context with the reader, and keep the factory's data alive.
  const shapes = isSliceStore ? sliceShapesOf(factoryState) : undefined;
  const shape = shapes ? undefined : shapeOf(factoryState);
  let initial: T | undefined;
  return () => {
    if (initial === undefined) {
      const memo: StateCopyMemo = new Map();
      if (shape) {
        initial = readInitial(shape, root, memo) as T;
      } else {
        const slices = {} as Record<PropertyKey, unknown>;
        for (const [key, sliceShape] of shapes!) {
          slices[key] = readInitial(
            sliceShape,
            root[key] as Record<PropertyKey, unknown>,
            memo
          );
        }
        initial = slices as T;
      }
    }
    return initial;
  };
};
