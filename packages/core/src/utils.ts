const isEqual = (x: unknown, y: unknown) => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  return x !== x && y !== y;
};

export const isUnsafeKey = (key: string) =>
  key === '__proto__' || key === 'prototype' || key === 'constructor';

export const isUnsafePathSegment = (segment: unknown) =>
  typeof segment === 'string' && isUnsafeKey(segment);

export class StateSchemaError extends Error {
  name = 'StateSchemaError';
}

export const isStateSchemaError = (error: unknown): error is StateSchemaError =>
  error instanceof StateSchemaError;

export type StateSchema = {
  rootKeys: Set<PropertyKey>;
  sliceKeys?: Map<PropertyKey, Set<PropertyKey>>;
};

export const hasUnsafePatchPath = (path: unknown) => {
  const segments = Array.isArray(path)
    ? path
    : typeof path === 'string'
      ? path
          .split('/')
          .filter(Boolean)
          .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
      : [];
  return segments.some(isUnsafePathSegment);
};

export const sanitizePatches = <T extends { path: unknown; value?: unknown }>(
  patches: T[] | undefined
) =>
  patches
    ?.filter((patch) => !hasUnsafePatchPath(patch.path))
    .map((patch) =>
      Object.prototype.hasOwnProperty.call(patch, 'value')
        ? {
            ...patch,
            value: sanitizeReplacementState(patch.value)
          }
        : patch
    );

export const setOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown
) => {
  if (typeof key === 'string' && isUnsafeKey(key)) {
    return;
  }
  target[key] = value;
};

export const getOwnEnumerableKeys = (source: unknown) => {
  if (typeof source !== 'object' || source === null) {
    return [];
  }
  return Reflect.ownKeys(source).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(source, key)
  );
};

const getOwnSchemaKeys = (source: unknown) => {
  if (typeof source !== 'object' || source === null) {
    return [];
  }
  return Reflect.ownKeys(source).filter(
    (key) => !(typeof key === 'string' && isUnsafeKey(key))
  );
};

const formatSchemaPath = (path: PropertyKey[]) =>
  path.length ? path.map((key) => String(key)).join('.') : '<root>';

const assertKnownSchemaKey = (
  knownKeys: Set<PropertyKey>,
  key: PropertyKey,
  path: PropertyKey[]
) => {
  if (typeof key === 'string' && isUnsafeKey(key)) {
    return;
  }
  if (knownKeys.has(key)) {
    return;
  }
  throw new StateSchemaError(
    `Unknown state key '${formatSchemaPath([...path, key])}' cannot be added after store initialization. Coaction state schema is fixed.`
  );
};

export const createStateSchema = (
  rootState: unknown,
  isSliceStore: boolean
): StateSchema => {
  const rootKeys = new Set(getOwnSchemaKeys(rootState));
  if (!isSliceStore) {
    return {
      rootKeys
    };
  }
  const sliceKeys = new Map<PropertyKey, Set<PropertyKey>>();
  if (typeof rootState === 'object' && rootState !== null) {
    const rootRecord = rootState as Record<PropertyKey, unknown>;
    rootKeys.forEach((key) => {
      const slice = rootRecord[key];
      if (typeof slice === 'object' && slice !== null) {
        sliceKeys.set(key, new Set(getOwnSchemaKeys(slice)));
      }
    });
  }
  return {
    rootKeys,
    sliceKeys
  };
};

export const assertKnownStateShape = (
  source: unknown,
  rootState: unknown,
  schema: StateSchema | undefined,
  isSliceStore: boolean
) => {
  if (typeof source !== 'object' || source === null) {
    return;
  }
  const rootKeys = schema?.rootKeys ?? new Set(getOwnSchemaKeys(rootState));
  const sourceRecord = source as Record<PropertyKey, unknown>;
  for (const key of getOwnEnumerableKeys(source)) {
    assertKnownSchemaKey(rootKeys, key, []);
    if (!isSliceStore) {
      continue;
    }
    const slice = sourceRecord[key];
    if (typeof slice !== 'object' || slice === null) {
      continue;
    }
    const knownSliceKeys =
      schema?.sliceKeys?.get(key) ??
      (typeof rootState === 'object' &&
      rootState !== null &&
      typeof (rootState as Record<PropertyKey, unknown>)[key] === 'object' &&
      (rootState as Record<PropertyKey, unknown>)[key] !== null
        ? new Set(
            getOwnSchemaKeys((rootState as Record<PropertyKey, unknown>)[key])
          )
        : undefined);
    if (!knownSliceKeys) {
      continue;
    }
    for (const sliceKey of getOwnEnumerableKeys(slice)) {
      assertKnownSchemaKey(knownSliceKeys, sliceKey, [key]);
    }
  }
};

const isArrayIndexKey = (key: PropertyKey) => {
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  );
};

export const assignOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>,
  seen = new WeakMap<object, unknown>()
) => {
  if (!seen.has(source)) {
    seen.set(source, target);
  }
  for (const key of getOwnEnumerableKeys(source)) {
    setOwnEnumerable(target, key, sanitizeReplacementState(source[key], seen));
  }
};

export const replaceOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  const seen = new WeakMap<object, unknown>();
  seen.set(source, target);
  const nextKeys = new Set<PropertyKey>();
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    if (typeof source[key] === 'function') {
      continue;
    }
    nextKeys.add(key);
  }
  for (const key of getOwnEnumerableKeys(target)) {
    if (!nextKeys.has(key)) {
      delete target[key];
    }
  }
  nextKeys.forEach((key) => {
    setOwnEnumerable(target, key, sanitizeReplacementState(source[key], seen));
  });
};

export const cloneOwnEnumerable = <T extends Record<PropertyKey, unknown>>(
  source: T
) => {
  const target = {} as T;
  assignOwnEnumerable(target, source);
  return target;
};

export const sanitizeReplacementState = <T>(
  source: T,
  seen = new WeakMap<object, unknown>()
): T => {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  const cached = seen.get(source);
  if (cached) {
    return cached as T;
  }
  if (Array.isArray(source)) {
    const target: unknown[] = [];
    target.length = source.length;
    seen.set(source, target);
    for (let index = 0; index < source.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(source, index)) {
        target[index] = sanitizeReplacementState(source[index], seen);
      }
    }
    for (const key of getOwnEnumerableKeys(source)) {
      if (
        isArrayIndexKey(key) ||
        (typeof key === 'string' && isUnsafeKey(key))
      ) {
        continue;
      }
      const value = (source as Record<PropertyKey, unknown>)[key];
      if (typeof value === 'function') {
        continue;
      }
      setOwnEnumerable(
        target as unknown as Record<PropertyKey, unknown>,
        key,
        sanitizeReplacementState(value, seen)
      );
    }
    return target as T;
  }
  const prototype = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null) {
    return source;
  }
  const target = Object.create(prototype) as Record<PropertyKey, unknown>;
  seen.set(source, target);
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    const value = (source as Record<PropertyKey, unknown>)[key];
    if (typeof value === 'function') {
      continue;
    }
    setOwnEnumerable(target, key, sanitizeReplacementState(value, seen));
  }
  return target as T;
};

export const sanitizeInitialStateValue = <T>(
  source: T,
  seen = new WeakMap<object, unknown>()
): T => {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  const cached = seen.get(source);
  if (cached) {
    return cached as T;
  }
  if (Array.isArray(source)) {
    const target: unknown[] = [];
    target.length = source.length;
    seen.set(source, target);
    for (let index = 0; index < source.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(source, index)) {
        target[index] = sanitizeInitialStateValue(source[index], seen);
      }
    }
    for (const key of getOwnEnumerableKeys(source)) {
      if (
        isArrayIndexKey(key) ||
        (typeof key === 'string' && isUnsafeKey(key))
      ) {
        continue;
      }
      setOwnEnumerable(
        target as unknown as Record<PropertyKey, unknown>,
        key,
        sanitizeInitialStateValue(
          (source as Record<PropertyKey, unknown>)[key],
          seen
        )
      );
    }
    return target as T;
  }
  const prototype = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null) {
    return source;
  }
  const target = Object.create(prototype) as Record<PropertyKey, unknown>;
  seen.set(source, target);
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    setOwnEnumerable(
      target,
      key,
      sanitizeInitialStateValue(
        (source as Record<PropertyKey, unknown>)[key],
        seen
      )
    );
  }
  return target as T;
};

export const areShallowEqualWithArray = (
  prev: any[] | null | IArguments,
  next: any[] | null | IArguments
) => {
  if (prev === null || next === null || prev.length !== next.length) {
    return false;
  }
  const { length } = prev;
  for (let i = 0; i < length; i += 1) {
    if (
      Object.prototype.hasOwnProperty.call(prev, i) !==
      Object.prototype.hasOwnProperty.call(next, i)
    ) {
      return false;
    }
    if (!isEqual(prev[i], next[i])) {
      return false;
    }
  }
  return true;
};

export const mergeObject = (target: any, source: any, isSlice?: boolean) => {
  if (isSlice) {
    if (typeof source === 'object' && source !== null) {
      for (const key of getOwnEnumerableKeys(source)) {
        if (typeof key === 'string' && isUnsafeKey(key)) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
          continue;
        }
        const sourceValue = source[key];
        if (typeof sourceValue !== 'object' || sourceValue === null) {
          continue;
        }
        const targetValue = target[key];
        if (typeof targetValue === 'object' && targetValue !== null) {
          assignOwnEnumerable(targetValue, sourceValue);
        }
      }
    }
  } else {
    if (typeof source === 'object' && source !== null) {
      assignOwnEnumerable(target, source);
    }
  }
};

export const uuid = () => {
  let timestamp = new Date().getTime();
  const uuidTemplate = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  const uuid = uuidTemplate.replace(/[xy]/g, (char) => {
    const randomNum = ((timestamp + Math.random() * 16) % 16) | 0;
    timestamp = Math.floor(timestamp / 16);
    return (char === 'x' ? randomNum : (randomNum & 0x3) | 0x8).toString(16);
  });
  return uuid;
};
