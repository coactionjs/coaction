import * as Y from 'yjs';
import {
  clone,
  isPlainObject,
  isUnsafeKey,
  sanitizePlainValue
} from './shared';

export function toPlainObject(value: Y.Map<unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  value.forEach((item, key) => {
    if (isUnsafeKey(key)) {
      return;
    }
    next[key] = toPlainValue(item);
  });
  return next;
}

export function toPlainArray(value: Y.Array<unknown>): unknown[] {
  return value.toArray().map((item) => toPlainValue(item));
}

export function toPlainValue(value: unknown): unknown {
  if (value instanceof Y.Map) {
    return toPlainObject(value);
  }
  if (value instanceof Y.Array) {
    return toPlainArray(value);
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    return sanitizePlainValue(value);
  }
  return value;
}

export function createYMap(value: Record<string, unknown>): Y.Map<unknown> {
  const next = new Y.Map<unknown>();
  for (const [key, item] of Object.entries(value)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    next.set(key, toYValue(item));
  }
  return next;
}

export function createYArray(value: unknown[]): Y.Array<unknown> {
  const next = new Y.Array<unknown>();
  if (value.length > 0) {
    next.insert(
      0,
      value.map((item) => toYValue(item))
    );
  }
  return next;
}

export function toYValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return createYArray(value);
  }
  if (isPlainObject(value)) {
    return createYMap(value);
  }
  if (typeof value === 'object' && value !== null) {
    return clone(value);
  }
  return value;
}
