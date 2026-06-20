const isEqual = (x: unknown, y: unknown) => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  return x !== x && y !== y;
};

export const isUnsafeKey = (key: string) =>
  key === '__proto__' || key === 'prototype' || key === 'constructor';

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

export const assignOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  for (const key of getOwnEnumerableKeys(source)) {
    setOwnEnumerable(target, key, source[key]);
  }
};

export const replaceOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
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
    setOwnEnumerable(target, key, source[key]);
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
    seen.set(source, target);
    for (let index = 0; index < source.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(source, index)) {
        target[index] = sanitizeReplacementState(source[index], seen);
      }
    }
    return target as T;
  }
  const target = {} as Record<PropertyKey, unknown>;
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

export const areShallowEqualWithArray = (
  prev: any[] | null | IArguments,
  next: any[] | null | IArguments
) => {
  if (prev === null || next === null || prev.length !== next.length) {
    return false;
  }
  const { length } = prev;
  for (let i = 0; i < length; i += 1) {
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
