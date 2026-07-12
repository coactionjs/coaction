import {
  Computed,
  createCachedGetter,
  createTrackedStateReader
} from './computed';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import {
  getImmutableStateSnapshot,
  indexImmutableStateSnapshot,
  isImmutableStateObject
} from './immutableState';
import { sanitizeInitialStateValue } from './utils';

type PrepareStateDescriptorOptions<T extends CreateState> = {
  descriptor: PropertyDescriptor;
  internal: Internal<T>;
  initialStateSeen: WeakMap<object, unknown>;
  key: PropertyKey;
  rawState: Record<PropertyKey, any>;
  sliceKey?: PropertyKey;
};

const assertImmutableStateMutationAllowed = <T extends CreateState>(
  internal: Internal<T>
) => {
  if (internal.mutableInstance || internal.isBatching) {
    return;
  }
  throw new Error(
    'Direct state mutation is not allowed in immutable Coaction stores. Wrap mutations in set(() => { ... }).'
  );
};

const readonlyProxyCache = new WeakMap<
  Internal<any>,
  WeakMap<object, unknown>
>();

const getReadonlyProxyCache = <T extends CreateState>(
  internal: Internal<T>
) => {
  let cache = readonlyProxyCache.get(internal);
  if (!cache) {
    cache = new WeakMap<object, unknown>();
    readonlyProxyCache.set(internal, cache);
  }
  return cache;
};

const getPublicStateObject = <T extends CreateState>(
  internal: Internal<T>,
  value: object,
  sliceKey?: PropertyKey
) => {
  if (value === internal.rootState) {
    return internal.module;
  }
  if (
    typeof sliceKey === 'undefined' ||
    typeof internal.rootState !== 'object' ||
    internal.rootState === null ||
    typeof internal.module !== 'object' ||
    internal.module === null
  ) {
    return undefined;
  }
  const rootState = internal.rootState as Record<PropertyKey, unknown>;
  const module = internal.module as Record<PropertyKey, unknown>;
  if (rootState[sliceKey] === value) {
    return module[sliceKey];
  }
  return undefined;
};

const toReadonlyStateValue = <T extends CreateState>(
  internal: Internal<T>,
  value: unknown,
  sliceKey?: PropertyKey
): unknown => {
  if (
    internal.mutableInstance ||
    internal.isBatching ||
    !isImmutableStateObject(value)
  ) {
    return value;
  }
  if (internal.computedReadDepth) {
    const cache = (internal.computedSnapshotCache ??= new WeakMap());
    if (
      isImmutableStateObject(internal.rootState) &&
      !cache.has(internal.rootState)
    ) {
      getImmutableStateSnapshot(internal.rootState, cache);
    }
    return getImmutableStateSnapshot(value, cache);
  }
  const publicValue = getPublicStateObject(internal, value, sliceKey);
  if (publicValue) {
    return publicValue;
  }
  const cache = getReadonlyProxyCache(internal);
  const cached = cache.get(value);
  if (cached) {
    return cached;
  }
  const proxy = new Proxy(value as Record<PropertyKey, unknown>, {
    get(target, key, receiver) {
      return toReadonlyStateValue(
        internal,
        Reflect.get(target, key, receiver),
        sliceKey
      );
    },
    set() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    },
    deleteProperty() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    },
    defineProperty() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    },
    setPrototypeOf() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    }
  });
  cache.set(value, proxy);
  return proxy;
};

const toPublicComputedValue = <T extends CreateState>(
  internal: Internal<T>,
  value: unknown,
  sliceKey?: PropertyKey
) => {
  if (!isImmutableStateObject(value)) {
    return value;
  }
  const cache = internal.computedSnapshotCache;
  const rootSnapshot = cache?.get(internal.rootState as unknown as object);
  const sources = (internal.computedSnapshotSources ??= new WeakMap());
  let source = sources.get(value);
  if (!source && Object.isFrozen(value) && rootSnapshot) {
    indexImmutableStateSnapshot(internal.rootState, rootSnapshot, sources);
    source = sources.get(value);
  }
  if (source) {
    internal.computedIdentityRequired = true;
  }
  return source ? toReadonlyStateValue(internal, source, sliceKey) : value;
};

export const prepareStateDescriptor = <T extends CreateState>({
  descriptor,
  initialStateSeen,
  internal,
  key,
  rawState,
  sliceKey
}: PrepareStateDescriptorOptions<T>) => {
  const isComputed = descriptor.value instanceof Computed;
  const readStateValue = () =>
    typeof sliceKey !== 'undefined'
      ? (internal.rootState as any)[sliceKey][key]
      : (internal.rootState as any)[key];
  const initialValue = isComputed
    ? descriptor.value
    : sanitizeInitialStateValue(descriptor.value, initialStateSeen);
  if (internal.mutableInstance) {
    Object.defineProperty(rawState, key, {
      get: () => internal.mutableInstance[key],
      set: (value) => {
        internal.mutableInstance[key] = value;
      },
      configurable: true,
      enumerable: descriptor.enumerable
    });
  } else if (!isComputed) {
    Object.defineProperty(rawState, key, {
      value: initialValue,
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true
    });
  }

  if (isComputed) {
    if (internal.mutableInstance) {
      throw new Error('Computed is not supported with mutable instance');
    }
    const getComputed = (descriptor.value as Computed).createGetter({
      internal
    });
    descriptor.get = function () {
      return toPublicComputedValue(internal, getComputed.call(this), sliceKey);
    };
  } else if (typeof sliceKey !== 'undefined') {
    const read = createTrackedStateReader(
      internal,
      readStateValue,
      initialValue
    );
    descriptor.get = () => toReadonlyStateValue(internal, read(), sliceKey);
    descriptor.set = (value: unknown) => {
      assertImmutableStateMutationAllowed(internal);
      (internal.rootState as any)[sliceKey][key] = value;
    };
  } else {
    const read = createTrackedStateReader(
      internal,
      readStateValue,
      initialValue
    );
    descriptor.get = () => toReadonlyStateValue(internal, read());
    descriptor.set = (value: unknown) => {
      assertImmutableStateMutationAllowed(internal);
      (internal.rootState as any)[key] = value;
    };
  }

  // handle state property
  delete descriptor.value;
  delete descriptor.writable;
};

export const prepareAccessorDescriptor = <T extends CreateState>({
  descriptor,
  internal,
  sliceKey
}: Pick<
  PrepareStateDescriptorOptions<T>,
  'descriptor' | 'internal' | 'sliceKey'
>) => {
  if (internal.mutableInstance || typeof descriptor.get !== 'function') {
    return;
  }
  const getComputed = createCachedGetter(internal, descriptor.get);
  descriptor.get = function () {
    return toPublicComputedValue(internal, getComputed.call(this), sliceKey);
  };
};
