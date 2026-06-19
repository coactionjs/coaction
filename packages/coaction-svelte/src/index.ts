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

export * from 'coaction';

type Unsubscriber = () => void;

type Readable<T> = {
  subscribe: (
    run: (value: T) => void,
    invalidate?: (value?: T) => void
  ) => Unsubscriber;
};

export type StoreReturn<T extends object> = Omit<Store<T>, 'subscribe'> & {
  (): T;
  <P>(selector: (state: T) => P): Readable<P>;
  subscribe: Readable<T>['subscribe'];
  select: <P>(selector: (state: T) => P) => Readable<P>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'subscribe'> & {
  (): Asyncify<T, D>;
  <P>(selector: (state: Asyncify<T, D>) => P): Readable<P>;
  subscribe: Readable<Asyncify<T, D>>['subscribe'];
  select: <P>(selector: (state: Asyncify<T, D>) => P) => Readable<P>;
};

export type CreateState = ISlices | Record<string, Slice<any>>;

export type Creator = {
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
};

const createReadable = <T extends object, P>(
  store: Store<T>,
  selector: (state: T) => P,
  subscribeStore: Store<T>['subscribe'] = store.subscribe.bind(store)
): Readable<P> => ({
  subscribe(run, invalidate) {
    run(selector(store.getState()));
    return subscribeStore(() => {
      const value = selector(store.getState());
      invalidate?.(value);
      run(value);
    });
  }
});

export const create: Creator = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const baseSubscribe = store.subscribe.bind(store);
  function select<P>(selector: (state: any) => P) {
    return createReadable(store as Store<any>, selector, baseSubscribe);
  }
  const subscribe = ((run: any, invalidate?: any) => {
    run(store.getState());
    return baseSubscribe(() => {
      const state = store.getState();
      invalidate?.(state);
      run(state);
    });
  }) as StoreReturn<any>['subscribe'];
  Object.assign(store, {
    subscribe,
    select
  });
  return wrapStore(store, (selector: any) => {
    if (typeof selector === 'function') {
      return select(selector);
    }
    return store.getState();
  }) as any;
};
