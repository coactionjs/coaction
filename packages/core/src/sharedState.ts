import { getOwnEnumerableKeys } from './utils';

const formatPropertyPath = (path: PropertyKey[]) =>
  path.map((key) => String(key)).join('.');

type SharedStateSymbolViolation =
  | {
      type: 'key';
      path: PropertyKey[];
    }
  | {
      type: 'value';
      path: PropertyKey[];
    };

const findSymbolViolation = (
  value: unknown,
  path: PropertyKey[] = [],
  seen = new WeakSet<object>()
): SharedStateSymbolViolation | undefined => {
  if (typeof value === 'symbol') {
    return {
      type: 'value',
      path
    };
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  for (const key of getOwnEnumerableKeys(value)) {
    const nextPath = [...path, key];
    if (typeof key === 'symbol') {
      return {
        type: 'key',
        path: nextPath
      };
    }
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (typeof child === 'function') {
      continue;
    }
    const violation = findSymbolViolation(child, nextPath, seen);
    if (violation) {
      return violation;
    }
  }
  return undefined;
};

export const validateSharedStateSerializable = (state: unknown) => {
  const violation = findSymbolViolation(state);
  if (!violation) {
    return;
  }
  if (violation.type === 'key') {
    throw new Error(
      `Symbol-keyed state is not supported in shared store mode because transport synchronization uses JSON and string action paths. Found symbol key at ${formatPropertyPath(violation.path)}.`
    );
  }
  throw new Error(
    `Symbol-valued state is not supported in shared store mode because transport synchronization uses JSON. Found symbol value at ${formatPropertyPath(violation.path)}.`
  );
};
