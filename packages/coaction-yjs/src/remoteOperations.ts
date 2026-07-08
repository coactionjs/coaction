import { StateSchemaError } from 'coaction';
import * as Y from 'yjs';
import { isUnsafePathSegment, sanitizePlainValue } from './shared';
import { toPlainValue } from './yjsValue';

export type PathSegment = string | number;

export type RemoteOperation =
  | {
      type: 'set';
      path: PathSegment[];
      value: unknown;
    }
  | {
      type: 'delete';
      path: PathSegment[];
    };

export function isSetStateReentryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'setState cannot be called within the updater'
  );
}

function cloneForStore<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    return sanitizePlainValue(value);
  }
  return value;
}

function toPathKey(path: PathSegment[]): string {
  return path
    .map((segment) => `${typeof segment}:${String(segment)}`)
    .join('|');
}

function toArrayIndex(segment: PathSegment): number | undefined {
  const index =
    typeof segment === 'number' ? segment : Number.parseInt(segment, 10);
  if (!Number.isInteger(index) || index < 0) {
    return undefined;
  }
  if (typeof segment === 'string' && String(index) !== segment) {
    return undefined;
  }
  return index;
}

function assertCanSetPathSegment(
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  path: PathSegment[]
) {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    return;
  }
  if (Object.isExtensible(target)) {
    return;
  }
  throw new StateSchemaError(
    `Unknown state key '${path.map((segment) => String(segment)).join('.')}' cannot be added after store initialization. Coaction state schema is fixed.`
  );
}

function clearObjectKey(
  target: Record<PropertyKey, unknown>,
  key: PropertyKey
) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor?.configurable) {
    delete target[key];
    return;
  }
  if (descriptor && 'set' in descriptor && descriptor.set) {
    target[key] = undefined;
    return;
  }
  if (descriptor && 'writable' in descriptor && descriptor.writable) {
    target[key] = undefined;
  }
}

export function compactOperations(
  operations: RemoteOperation[]
): RemoteOperation[] {
  const deduplicated = new Map<string, RemoteOperation>();
  for (const operation of operations) {
    const key = toPathKey(operation.path);
    if (deduplicated.has(key)) {
      deduplicated.delete(key);
    }
    deduplicated.set(key, operation);
  }
  return Array.from(deduplicated.values()).sort(
    (left, right) => left.path.length - right.path.length
  );
}

export function getYValueAtPath(
  root: Y.Map<unknown>,
  path: PathSegment[]
): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current instanceof Y.Map) {
      current = current.get(String(segment));
      continue;
    }
    if (current instanceof Y.Array) {
      const index = toArrayIndex(segment);
      if (typeof index === 'undefined') {
        return undefined;
      }
      current = current.get(index);
      continue;
    }
    return undefined;
  }
  return current;
}

export function setAtPath(target: any, path: PathSegment[], value: unknown) {
  if (path.length === 0) {
    return;
  }
  if (path.some(isUnsafePathSegment)) {
    return;
  }
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextSegment = path[index + 1];
    const segmentIndex = Array.isArray(current)
      ? toArrayIndex(segment)
      : undefined;
    const targetKey =
      typeof segmentIndex === 'undefined' ? segment : segmentIndex;
    const nextValue = current[targetKey];
    const needsArray =
      typeof nextSegment === 'number' ||
      (Array.isArray(nextValue) &&
        typeof toArrayIndex(nextSegment) !== 'undefined');
    if (
      typeof nextValue !== 'object' ||
      nextValue === null ||
      (needsArray ? !Array.isArray(nextValue) : Array.isArray(nextValue))
    ) {
      assertCanSetPathSegment(current, targetKey, path.slice(0, index + 1));
      current[targetKey] = typeof nextSegment === 'number' ? [] : {};
    }
    current = current[targetKey];
  }
  const leaf = path[path.length - 1];
  const leafIndex = Array.isArray(current) ? toArrayIndex(leaf) : undefined;
  const leafKey = typeof leafIndex === 'undefined' ? leaf : leafIndex;
  assertCanSetPathSegment(current, leafKey, path);
  current[leafKey] = cloneForStore(value);
}

export function deleteAtPath(target: any, path: PathSegment[]) {
  if (path.length === 0) {
    return;
  }
  if (path.some(isUnsafePathSegment)) {
    return;
  }
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const segmentIndex = Array.isArray(current)
      ? toArrayIndex(segment)
      : undefined;
    current =
      current[typeof segmentIndex === 'undefined' ? segment : segmentIndex];
    if (typeof current !== 'object' || current === null) {
      return;
    }
  }
  const leaf = path[path.length - 1];
  if (Array.isArray(current)) {
    const leafIndex = toArrayIndex(leaf);
    if (
      typeof leafIndex !== 'undefined' &&
      leafIndex >= 0 &&
      leafIndex < current.length
    ) {
      current.splice(leafIndex, 1);
    }
    return;
  }
  clearObjectKey(current, leaf);
}

export function collectRemoteOperations(
  events: Y.YEvent<Y.AbstractType<unknown>>[],
  stateMap: Y.Map<unknown>
): RemoteOperation[] {
  const operations: RemoteOperation[] = [];
  for (const event of events) {
    if (event instanceof Y.YMapEvent) {
      for (const changedKey of event.keysChanged) {
        const path = [...event.path, changedKey];
        if (path.some(isUnsafePathSegment)) {
          continue;
        }
        const keyChange = event.changes.keys.get(changedKey);
        if (keyChange?.action === 'delete') {
          operations.push({
            type: 'delete',
            path
          });
          continue;
        }
        operations.push({
          type: 'set',
          path,
          value: toPlainValue(getYValueAtPath(stateMap, path))
        });
      }
      continue;
    }
    if (event instanceof Y.YArrayEvent) {
      const path = [...event.path];
      operations.push({
        type: 'set',
        path,
        value: toPlainValue(getYValueAtPath(stateMap, path))
      });
    }
  }
  return operations;
}
