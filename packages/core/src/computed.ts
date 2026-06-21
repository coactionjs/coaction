import {
  computed as createComputed,
  endBatch,
  signal,
  startBatch
} from 'alien-signals';
import type { Store } from './interface';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import { areShallowEqualWithArray } from './utils';

type Accessor<T> = () => T;
type GetterContext<T extends CreateState> = {
  internal: Internal<T>;
};

const isObjectLike = (value: unknown) =>
  typeof value === 'object' && value !== null;

export class Computed {
  constructor(
    public deps: (state: Store['getState']) => any[],
    public fn: (...args: any[]) => any
  ) {}

  createGetter<T extends CreateState>({ internal }: GetterContext<T>) {
    const memoByReceiver = new WeakMap<object, Accessor<unknown>>();
    const lastArgs = new WeakMap<object, any[]>();
    const lastResult = new WeakMap<object, unknown>();
    const fallbackReceiver = {};
    const evaluate = (receiver: object) => {
      const args = this.deps(internal.module as Store<T>['getState']);
      if (
        !lastArgs.has(receiver) ||
        !areShallowEqualWithArray(lastArgs.get(receiver)!, args)
      ) {
        lastResult.set(receiver, this.fn.apply(receiver, args));
      }
      lastArgs.set(receiver, args);
      return lastResult.get(receiver);
    };
    return function (this: object) {
      const receiver =
        typeof this === 'object' && this !== null ? this : fallbackReceiver;
      if (internal.isBatching) {
        return evaluate(receiver);
      }
      let accessor = memoByReceiver.get(receiver);
      if (!accessor) {
        accessor = createComputed(() => evaluate(receiver));
        memoByReceiver.set(receiver, accessor);
      }
      return accessor();
    };
  }
}

export const createCachedGetter = <T extends CreateState>(
  internal: Internal<T>,
  getter: () => unknown
) => {
  const accessors = new WeakMap<object, Accessor<unknown>>();
  const fallbackReceiver = {};
  return function (this: object) {
    const receiver =
      typeof this === 'object' && this !== null ? this : fallbackReceiver;
    if (internal.isBatching) {
      return getter.call(receiver);
    }
    let accessor = accessors.get(receiver);
    if (!accessor) {
      accessor = createComputed(() => getter.call(receiver));
      accessors.set(receiver, accessor);
    }
    return accessor();
  };
};

export const createTrackedStateReader = <T extends CreateState>(
  internal: Internal<T>,
  read: () => unknown,
  initialValue: unknown
) => {
  const slotSignal = signal(initialValue);
  const slotVersionSignal = signal(0);
  let slotVersion = 0;
  const slot = {
    refresh: () => {
      const nextValue = read();
      slotSignal(nextValue);
      if (internal.mutableInstance && isObjectLike(nextValue)) {
        slotVersion += 1;
        slotVersionSignal(slotVersion);
      }
    }
  };
  (internal.signalSlots ??= new Set()).add(slot);
  return () => {
    const currentValue = slotSignal();
    if (internal.mutableInstance && isObjectLike(currentValue)) {
      slotVersionSignal();
    }
    return read();
  };
};

export const refreshSignalSlots = <T extends CreateState>(
  internal: Internal<T>
) => {
  if (!internal.signalSlots?.size) {
    return;
  }
  startBatch();
  try {
    internal.signalSlots.forEach((slot) => slot.refresh());
  } finally {
    endBatch();
  }
};

const defaultMemoize = (func: (...args: any) => any) => {
  const lastArgs: WeakMap<object, IArguments | null> = new WeakMap();
  const lastResult: WeakMap<object, unknown> = new WeakMap();
  const fallbackReceiver = {};
  return function (this: unknown) {
    const receiver =
      (typeof this === 'object' && this !== null) || typeof this === 'function'
        ? (this as object)
        : fallbackReceiver;
    if (
      !lastArgs.has(receiver) ||
      !areShallowEqualWithArray(lastArgs.get(receiver)!, arguments)
    ) {
      lastResult.set(receiver, func.apply(this, arguments as any));
    }
    lastArgs.set(receiver, arguments);
    return lastResult.get(receiver);
  };
};

const createSelectorCreatorWithArray = (
  memoize: (...args: any) => (..._args: any) => any = defaultMemoize
) => {
  return (
    dependenciesFunc: (that: any) => any[],
    resultFunc: (...args: any) => any
  ) => {
    const memoizedResultFunc = memoize(function (this: unknown) {
      return resultFunc.apply(this, arguments as any);
    });
    return function (this: unknown) {
      return memoizedResultFunc.apply(
        this,
        dependenciesFunc.apply(null, [this])
      );
    };
  };
};

export const createSelectorWithArray = createSelectorCreatorWithArray();
