import { getOwnEnumerableKeys } from './utils';

const formatPropertyPath = (path: PropertyKey[]) =>
  path.length ? path.map((key) => String(key)).join('.') : '<root>';

type SharedStateViolation =
  | {
      type: 'symbol-key';
      path: PropertyKey[];
    }
  | {
      type: 'symbol-value';
      path: PropertyKey[];
    }
  | {
      type:
        | 'bigint'
        | 'undefined'
        | 'function'
        | 'non-finite-number'
        | 'non-plain-object'
        | 'circular-reference'
        | 'array-hole'
        | 'array-property'
        | 'to-json';
      path: PropertyKey[];
    };

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isArrayIndexKey = (key: string, length: number) => {
  if (key === '') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
};

const findSymbolKeyViolation = (
  value: unknown,
  path: PropertyKey[] = [],
  seen = new WeakSet<object>()
): SharedStateViolation | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of getOwnEnumerableKeys(value)) {
    const nextPath = [...path, key];
    if (typeof key === 'symbol') {
      return {
        type: 'symbol-key',
        path: nextPath
      };
    }
    const descriptor = descriptors[key];
    if (
      descriptor &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      const violation = findSymbolKeyViolation(
        descriptor.value,
        nextPath,
        seen
      );
      if (violation) {
        return violation;
      }
    }
  }
  return undefined;
};

const findJsonViolation = (
  value: unknown,
  path: PropertyKey[] = [],
  ancestors = new WeakSet<object>()
): SharedStateViolation | undefined => {
  switch (typeof value) {
    case 'symbol':
      return {
        type: 'symbol-value',
        path
      };
    case 'bigint':
    case 'undefined':
    case 'function':
      return {
        type: typeof value,
        path
      };
    case 'number':
      return Number.isFinite(value)
        ? undefined
        : {
            type: 'non-finite-number',
            path
          };
    default:
      break;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (ancestors.has(value)) {
    return {
      type: 'circular-reference',
      path
    };
  }
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return {
          type: 'array-hole',
          path: [...path, index]
        };
      }
    }
    for (const key of getOwnEnumerableKeys(value)) {
      const nextPath = [...path, key];
      if (typeof key === 'symbol') {
        return {
          type: 'symbol-key',
          path: nextPath
        };
      }
      if (!isArrayIndexKey(key, value.length)) {
        return {
          type: 'array-property',
          path: nextPath
        };
      }
      const violation = findJsonViolation(
        value[Number(key)],
        nextPath,
        ancestors
      );
      if (violation) {
        return violation;
      }
    }
    ancestors.delete(value);
    return undefined;
  }
  if (!isPlainObject(value)) {
    return {
      type: 'non-plain-object',
      path
    };
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return {
      type: 'to-json',
      path
    };
  }
  ancestors.add(value);
  for (const key of getOwnEnumerableKeys(value)) {
    const nextPath = [...path, key];
    if (typeof key === 'symbol') {
      return {
        type: 'symbol-key',
        path: nextPath
      };
    }
    const child = (value as Record<PropertyKey, unknown>)[key];
    const violation = findJsonViolation(child, nextPath, ancestors);
    if (violation) {
      return violation;
    }
  }
  ancestors.delete(value);
  return undefined;
};

const getViolationLabel = (violation: SharedStateViolation) => {
  switch (violation.type) {
    case 'bigint':
      return 'BigInt-valued state';
    case 'undefined':
      return 'Undefined-valued state';
    case 'function':
      return 'Function-valued state';
    case 'non-finite-number':
      return 'NaN or infinite number state';
    case 'non-plain-object':
      return 'Non-plain object state';
    case 'circular-reference':
      return 'Circular state reference';
    case 'array-hole':
      return 'Sparse array state';
    case 'array-property':
      return 'Non-index array property state';
    case 'to-json':
      return 'Custom toJSON state';
    default:
      return undefined;
  }
};

export const validateSharedActionPaths = (state: unknown) => {
  const violation = findSymbolKeyViolation(state);
  if (!violation) {
    return;
  }
  throw new Error(
    `Symbol-keyed state is not supported in shared store mode because transport synchronization uses JSON and string action paths. Found symbol key at ${formatPropertyPath(violation.path)}.`
  );
};

export const validateSharedStateSerializable = (state: unknown) => {
  const violation = findJsonViolation(state);
  if (!violation) {
    return;
  }
  if (violation.type === 'symbol-key') {
    throw new Error(
      `Symbol-keyed state is not supported in shared store mode because transport synchronization uses JSON and string action paths. Found symbol key at ${formatPropertyPath(violation.path)}.`
    );
  }
  if (violation.type === 'symbol-value') {
    throw new Error(
      `Symbol-valued state is not supported in shared store mode because transport synchronization uses JSON. Found symbol value at ${formatPropertyPath(violation.path)}.`
    );
  }
  throw new Error(
    `${getViolationLabel(violation)} is not supported in shared store mode because transport synchronization uses JSON. Found unsupported value at ${formatPropertyPath(violation.path)}.`
  );
};
