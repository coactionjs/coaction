export const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
};

export const isUnsafeKey = (key: string) =>
  key === '__proto__' || key === 'prototype' || key === 'constructor';

export const isUnsafePathSegment = (segment: string | number) =>
  typeof segment === 'string' && isUnsafeKey(segment);

const cloneFallback = <T>(
  value: T,
  seen = new WeakMap<object, unknown>()
): T => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const cached = seen.get(value);
  if (cached) {
    return cached as T;
  }
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    seen.set(value, next);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        next[index] = cloneFallback(value[index], seen);
      }
    }
    return next as T;
  }
  if (isPlainObject(value)) {
    const next = Object.create(Object.getPrototypeOf(value)) as Record<
      PropertyKey,
      unknown
    >;
    seen.set(value, next);
    for (const key of Reflect.ownKeys(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        if (typeof key === 'string' && isUnsafeKey(key)) {
          continue;
        }
        next[key] = cloneFallback(
          (value as Record<PropertyKey, unknown>)[key],
          seen
        );
      }
    }
    return next as T;
  }
  return JSON.parse(JSON.stringify(value));
};

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return cloneFallback(value);
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function sanitizePlainValue<T>(
  value: T,
  seen = new WeakMap<object, unknown>()
): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const cached = seen.get(value);
  if (cached) {
    return cached as T;
  }
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    seen.set(value, next);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        next[index] = sanitizePlainValue(value[index], seen);
      }
    }
    return next as T;
  }
  if (!isPlainObject(value)) {
    return clone(value);
  }
  const next: Record<string, unknown> = {};
  seen.set(value, next);
  for (const key of Object.keys(value)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    next[key] = sanitizePlainValue(
      (value as Record<string, unknown>)[key],
      seen
    );
  }
  return next as T;
}
