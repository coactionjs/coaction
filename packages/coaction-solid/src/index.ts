import { create as createVanilla, wrapStore } from 'coaction';
import type {
  Asyncify,
  ClientStoreOptions,
  ISlices,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction';
import { createSignal, type Accessor } from 'solid-js';

export * from 'coaction';

type SelectorOptions = {
  autoSelector?: boolean;
};

type AutoSelector<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends readonly any[]
      ? Accessor<T[K]>
      : T[K] extends object
        ? AutoSelector<T[K]>
        : Accessor<T[K]>;
};

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P): Accessor<P>;
  (options: { autoSelector: true }): AutoSelector<T>;
  (options?: SelectorOptions): Accessor<T>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & {
  <P>(selector: (state: Asyncify<T, D>) => P): Accessor<P>;
  (options: { autoSelector: true }): AutoSelector<Asyncify<T, D>>;
  (options?: SelectorOptions): Accessor<Asyncify<T, D>>;
};

export type CreateState = ISlices | Record<PropertyKey, Slice<any>>;

export type Creator = {
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
};

const createAutoSelector = <T extends object>(
  store: Store<T>,
  getVersion: Accessor<number>
) => {
  const getPathValue = (path: PropertyKey[]) => {
    let current: unknown = store.getState();
    for (const key of path) {
      if (
        (typeof current !== 'object' && typeof current !== 'function') ||
        current === null
      ) {
        return undefined;
      }
      current = (current as Record<PropertyKey, unknown>)[key];
    }
    return current;
  };
  const createAction = (path: PropertyKey[]) =>
    ((...args: unknown[]) => {
      const fn = getPathValue(path);
      if (typeof fn !== 'function') {
        return undefined;
      }
      const receiverPath = path.slice(0, -1);
      const receiver = receiverPath.length
        ? getPathValue(receiverPath)
        : store.getState();
      return fn.apply(receiver, args);
    }) as (...args: unknown[]) => unknown;
  const createNode = (
    path: PropertyKey[],
    value: unknown,
    ancestors: object[] = []
  ): any => {
    if (typeof value === 'function') {
      return createAction(path);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return () => {
        getVersion();
        return getPathValue(path);
      };
    }
    if (ancestors.includes(value)) {
      return () => {
        getVersion();
        return getPathValue(path);
      };
    }
    const node = {} as Record<PropertyKey, any>;
    const nextAncestors = [...ancestors, value];
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      PropertyKey,
      PropertyDescriptor
    >;
    for (const key of Reflect.ownKeys(descriptors)) {
      node[key] = createNode(
        [...path, key],
        (value as Record<PropertyKey, unknown>)[key],
        nextAncestors
      );
    }
    return node;
  };
  const state = store.getState() as Record<PropertyKey, any>;
  const autoSelector = {} as Record<PropertyKey, any>;
  if (!store.isSliceStore) {
    const descriptors = Object.getOwnPropertyDescriptors(state) as Record<
      PropertyKey,
      PropertyDescriptor
    >;
    for (const key of Reflect.ownKeys(descriptors)) {
      autoSelector[key] = createNode(
        [key],
        (state as Record<PropertyKey, unknown>)[key]
      );
    }
    return autoSelector;
  }
  for (const sliceKey of Reflect.ownKeys(state)) {
    const slice = state[sliceKey];
    if (typeof slice !== 'object' || slice === null) {
      continue;
    }
    autoSelector[sliceKey] = createNode([sliceKey], slice);
  }
  return autoSelector;
};

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const [version, setVersion] = createSignal(0, {
    equals: false
  });
  const unsubscribe = store.subscribe(() => {
    setVersion((value) => value + 1);
  });
  const baseDestroy = store.destroy;
  store.destroy = () => {
    unsubscribe();
    baseDestroy();
  };
  let autoSelector: Record<PropertyKey, any> | undefined;
  return wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return () => {
        version();
        return selector(store.getState());
      };
    }
    if (selector?.autoSelector) {
      if (!autoSelector) {
        autoSelector = createAutoSelector(store, version);
      }
      return autoSelector;
    }
    return () => {
      version();
      return store.getState();
    };
  }) as any;
};
