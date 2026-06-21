import { onStoreReady, type Middleware, type Store } from 'coaction';
import * as Y from 'yjs';
import {
  collectRemoteOperations,
  compactOperations,
  deleteAtPath,
  getYValueAtPath,
  isSetStateReentryError,
  RemoteOperation,
  setAtPath
} from './remoteOperations';
import {
  clone,
  isPlainObject,
  isUnsafeKey,
  sanitizePlainValue,
  scheduleMicrotask
} from './shared';
import { syncObjectToYMap } from './sync';
import { createYMap, toPlainObject } from './yjsValue';

export * from 'yjs';

const STATE_KEY = 'state';

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter(
    (key) =>
      Object.prototype.propertyIsEnumerable.call(value, key) &&
      !(typeof key === 'string' && isUnsafeKey(key))
  );

const formatPropertyPath = (path: PropertyKey[]) =>
  path.length ? path.map((key) => String(key)).join('.') : '<root>';

type RootReplacementPatch = {
  op: 'add' | 'remove' | 'replace';
  path: Array<string | number>;
  value?: unknown;
};

type YjsStateViolation =
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
        | 'function'
        | 'non-plain-object'
        | 'circular-reference'
        | 'array-hole'
        | 'array-property';
      path: PropertyKey[];
    };

class YjsSerializableStateError extends Error {}

const isYjsSerializableStateError = (
  error: unknown
): error is YjsSerializableStateError =>
  error instanceof YjsSerializableStateError;

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

const findYjsStateViolation = (
  value: unknown,
  path: PropertyKey[] = [],
  ancestors = new WeakSet<object>()
): YjsStateViolation | undefined => {
  switch (typeof value) {
    case 'symbol':
      return {
        type: 'symbol-value',
        path
      };
    case 'function':
      return {
        type: 'function',
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
      const violation = findYjsStateViolation(
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
    const violation = findYjsStateViolation(child, nextPath, ancestors);
    if (violation) {
      return violation;
    }
  }
  ancestors.delete(value);
  return undefined;
};

const assertYjsSerializableState = (
  state: unknown,
  path: PropertyKey[] = []
) => {
  const violation = findYjsStateViolation(state, path);
  if (!violation) {
    return;
  }
  if (violation.type === 'symbol-key') {
    throw new YjsSerializableStateError(
      `Yjs binding does not support symbol-keyed state because Y.Map keys are strings. Found symbol key at ${formatPropertyPath(violation.path)}.`
    );
  }
  if (violation.type === 'symbol-value') {
    throw new YjsSerializableStateError(
      `Yjs binding does not support symbol-valued state because symbols cannot be cloned into Yjs documents. Found symbol value at ${formatPropertyPath(violation.path)}.`
    );
  }
  throw new YjsSerializableStateError(
    `Yjs binding does not support ${violation.type} state because only plain objects, arrays, and primitive values round-trip through Yjs updates. Found unsupported value at ${formatPropertyPath(violation.path)}.`
  );
};

const assertRemoteOperationsSerializable = (operations: RemoteOperation[]) => {
  for (const operation of operations) {
    if (operation.type === 'set') {
      assertYjsSerializableState(operation.value, operation.path);
    }
  }
};

const createRootReplacementPatches = (
  currentState: Record<PropertyKey, unknown>,
  nextState: Record<PropertyKey, unknown>
) => {
  const patches: RootReplacementPatch[] = [];
  const inversePatches: RootReplacementPatch[] = [];
  const nextKeys = new Set(getOwnEnumerableKeys(nextState));
  for (const key of getOwnEnumerableKeys(currentState)) {
    if (typeof key === 'symbol' || nextKeys.has(key)) {
      continue;
    }
    patches.push({
      op: 'remove',
      path: [key]
    });
    inversePatches.push({
      op: 'add',
      path: [key],
      value: currentState[key]
    });
  }
  for (const key of nextKeys) {
    if (typeof key === 'symbol') {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(currentState, key)) {
      patches.push({
        op: 'add',
        path: [key],
        value: nextState[key]
      });
      inversePatches.push({
        op: 'remove',
        path: [key]
      });
      continue;
    }
    if (Object.is(currentState[key], nextState[key])) {
      continue;
    }
    patches.push({
      op: 'replace',
      path: [key],
      value: nextState[key]
    });
    inversePatches.push({
      op: 'replace',
      path: [key],
      value: currentState[key]
    });
  }
  return {
    patches,
    inversePatches
  };
};

export type YjsBindingOptions = {
  doc?: Y.Doc;
  key?: string;
};

export type YjsBinding<T extends object> = {
  doc: Y.Doc;
  map: Y.Map<any>;
  syncNow: () => void;
  destroy: () => void;
  __unsafeTestOnly__?: {
    applyRemoteOperations: (
      operations: Array<{
        type: 'set' | 'delete';
        path: Array<string | number>;
        value?: unknown;
      }>
    ) => void;
  };
};

// Test-only hooks for driving defensive branches that are hard to reach via public flow.
export const __unsafeTestOnly__ = {
  getYValueAtPath: (root: Y.Map<unknown>, path: Array<string | number>) =>
    getYValueAtPath(root, path),
  setAtPath: (target: any, path: Array<string | number>, value: unknown) => {
    setAtPath(target, path, value);
  },
  deleteAtPath: (target: any, path: Array<string | number>) => {
    deleteAtPath(target, path);
  }
};

export const bindYjs = <T extends object>(
  store: Store<T>,
  options: YjsBindingOptions = {}
): YjsBinding<T> => {
  if (store.share === 'client') {
    throw new Error('Yjs binding is not supported in client store mode.');
  }
  const doc = options.doc ?? new Y.Doc();
  const key = options.key ?? `coaction:${store.name}`;
  const map = doc.getMap<any>(key);
  const localOrigin = Symbol(`coaction-yjs:${store.name}`);
  let destroyed = false;
  let syncingFromYjs = false;
  assertYjsSerializableState(store.getPureState());
  let lastSyncedState = (() => {
    const pureState = clone(store.getPureState());
    return isPlainObject(pureState) ? pureState : {};
  })();
  let flushScheduled = false;
  let pendingSnapshot: Record<string, unknown> | null = null;
  let pendingOperations: RemoteOperation[] = [];

  const restoreLastSyncedState = () => {
    syncingFromYjs = true;
    try {
      store.apply(lastSyncedState as T);
    } finally {
      syncingFromYjs = false;
    }
  };

  const applyRemoteState = (state: Record<string, unknown>) => {
    assertYjsSerializableState(state);
    const next = sanitizePlainValue(state);
    syncingFromYjs = true;
    try {
      if (store.share === 'main') {
        store.setState(next as T, () => {
          const { patches, inversePatches } = createRootReplacementPatches(
            store.getPureState() as Record<PropertyKey, unknown>,
            next as Record<PropertyKey, unknown>
          );
          const finalPatches = store.patch
            ? store.patch({
                patches: patches as any,
                inversePatches: inversePatches as any
              })
            : {
                patches: patches as any,
                inversePatches: inversePatches as any
              };
          if (finalPatches.patches.length) {
            store.apply(store.getPureState(), finalPatches.patches);
          }
          return [
            store.getPureState(),
            finalPatches.patches,
            finalPatches.inversePatches
          ];
        });
      } else {
        store.setState(null);
        store.apply(next as T);
      }
      const pureState = clone(store.getPureState());
      lastSyncedState = isPlainObject(pureState) ? pureState : {};
    } finally {
      syncingFromYjs = false;
    }
  };

  const applyRemoteOperations = (operations: RemoteOperation[]) => {
    if (operations.length === 0) {
      return;
    }
    assertRemoteOperationsSerializable(operations);
    syncingFromYjs = true;
    try {
      store.setState((draft) => {
        const mutableDraft = draft as Record<string, unknown>;
        for (const operation of operations) {
          if (operation.type === 'set') {
            setAtPath(mutableDraft, operation.path, operation.value);
          } else {
            deleteAtPath(mutableDraft, operation.path);
          }
        }
      });
      const pureState = clone(store.getPureState());
      lastSyncedState = isPlainObject(pureState) ? pureState : {};
    } finally {
      syncingFromYjs = false;
    }
  };

  const getStateMap = (): Y.Map<unknown> | null => {
    const state = map.get(STATE_KEY);
    if (state instanceof Y.Map) {
      return state;
    }
    return null;
  };

  const scheduleFlushFromYjs = () => {
    if (destroyed || flushScheduled) {
      return;
    }
    flushScheduled = true;
    scheduleMicrotask(flushFromYjs);
  };

  const flushFromYjs = () => {
    flushScheduled = false;
    if (destroyed) {
      return;
    }
    if (pendingSnapshot) {
      const snapshot = pendingSnapshot;
      pendingSnapshot = null;
      pendingOperations = [];
      try {
        applyRemoteState(snapshot);
      } catch (error) {
        if (isSetStateReentryError(error)) {
          pendingSnapshot = snapshot;
          setTimeout(scheduleFlushFromYjs, 0);
          return;
        }
        if (isYjsSerializableStateError(error)) {
          restoreRootState();
          return;
        }
        throw error;
      }
    }
    if (pendingOperations.length === 0) {
      return;
    }
    const operations = compactOperations(pendingOperations);
    pendingOperations = [];
    try {
      applyRemoteOperations(operations);
    } catch (error) {
      if (isSetStateReentryError(error)) {
        pendingOperations = [...operations, ...pendingOperations];
        setTimeout(scheduleFlushFromYjs, 0);
        return;
      }
      if (isYjsSerializableStateError(error)) {
        restoreRootState();
        return;
      }
      throw error;
    }
  };

  const enqueueSnapshot = (snapshot: Record<string, unknown>) => {
    pendingSnapshot = snapshot;
    pendingOperations = [];
    scheduleFlushFromYjs();
  };

  const enqueueOperations = (operations: RemoteOperation[]) => {
    if (operations.length === 0) {
      return;
    }
    if (!pendingSnapshot) {
      pendingOperations.push(...operations);
    }
    scheduleFlushFromYjs();
  };

  const syncNow = () => {
    if (destroyed || syncingFromYjs) {
      return;
    }
    try {
      assertYjsSerializableState(store.getPureState());
    } catch (error) {
      restoreLastSyncedState();
      throw error;
    }
    const pureState = clone(store.getPureState());
    if (!isPlainObject(pureState)) {
      return;
    }
    doc.transact(() => {
      syncObjectToYMap(stateMap, lastSyncedState, pureState);
    }, localOrigin);
    lastSyncedState = pureState;
  };

  const stateObserver = (
    events: Y.YEvent<Y.AbstractType<unknown>>[],
    transaction: Y.Transaction
  ) => {
    if (transaction.origin === localOrigin) {
      return;
    }
    enqueueOperations(collectRemoteOperations(events, stateMap));
  };

  let stateMap!: Y.Map<unknown>;
  let stateMapObserved = false;
  const unobserveStateMap = () => {
    if (!stateMapObserved) {
      return;
    }
    stateMap.unobserveDeep(stateObserver);
    stateMapObserved = false;
  };
  const observeStateMap = (nextStateMap: Y.Map<unknown>) => {
    if (stateMap === nextStateMap && stateMapObserved) {
      return;
    }
    unobserveStateMap();
    stateMap = nextStateMap;
    stateMap.observeDeep(stateObserver);
    stateMapObserved = true;
  };
  const migrateRootState = (nextState: Record<string, unknown>) => {
    const migrated = createYMap(nextState);
    doc.transact(() => {
      map.set(STATE_KEY, migrated);
    }, localOrigin);
    observeStateMap(migrated);
    enqueueSnapshot(nextState);
  };
  const restoreRootState = () => {
    const pureState = clone(store.getPureState());
    const nextState = isPlainObject(pureState) ? pureState : lastSyncedState;
    const restored = createYMap(nextState);
    doc.transact(() => {
      map.set(STATE_KEY, restored);
    }, localOrigin);
    observeStateMap(restored);
    lastSyncedState = nextState;
  };
  const applyInitialRemoteState = (state: Record<string, unknown>) => {
    try {
      applyRemoteState(state);
    } catch (error) {
      if (isYjsSerializableStateError(error)) {
        restoreRootState();
        return;
      }
      throw error;
    }
  };
  const existingStateMap = getStateMap();
  if (existingStateMap) {
    stateMap = existingStateMap;
    applyInitialRemoteState(toPlainObject(stateMap));
  } else {
    const currentState = map.get(STATE_KEY);
    if (isPlainObject(currentState)) {
      stateMap = createYMap(currentState);
      doc.transact(() => {
        map.set(STATE_KEY, stateMap);
      }, localOrigin);
      applyInitialRemoteState(currentState);
    } else {
      const pureState = clone(store.getPureState());
      stateMap = createYMap(isPlainObject(pureState) ? pureState : {});
      doc.transact(() => {
        map.set(STATE_KEY, stateMap);
      }, localOrigin);
    }
  }
  observeStateMap(stateMap);

  const observer = (event: Y.YMapEvent<any>) => {
    if (event.transaction.origin === localOrigin) {
      return;
    }
    if (!event.keysChanged.has(STATE_KEY)) {
      return;
    }
    const stateChange = event.changes.keys.get(STATE_KEY);
    const nextStateMap = getStateMap();
    if (nextStateMap) {
      observeStateMap(nextStateMap);
      enqueueSnapshot(toPlainObject(nextStateMap));
      return;
    }
    const currentState = map.get(STATE_KEY);
    if (isPlainObject(currentState)) {
      migrateRootState(currentState);
      return;
    }
    if (stateChange?.action === 'delete') {
      migrateRootState({});
      return;
    }
    restoreRootState();
  };

  map.observe(observer);
  const unsubscribe = store.subscribe(() => {
    syncNow();
  });

  const binding: YjsBinding<T> = {
    doc,
    map,
    syncNow,
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      unsubscribe();
      map.unobserve(observer);
      unobserveStateMap();
      if (!options.doc) {
        doc.destroy();
      }
    }
  };
  if (process.env.NODE_ENV === 'test') {
    binding.__unsafeTestOnly__ = {
      applyRemoteOperations: (operations) => {
        applyRemoteOperations(operations as RemoteOperation[]);
      }
    };
  }
  return binding;
};

export const yjs =
  <T extends object>(options: YjsBindingOptions = {}): Middleware<T> =>
  (store) => {
    let binding: YjsBinding<T> | undefined;
    const cancelBinding = onStoreReady(store, () => {
      binding = bindYjs(store, options);
    });
    const baseDestroy = store.destroy;
    let destroyed = false;
    store.destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      cancelBinding();
      binding?.destroy();
      binding = undefined;
      baseDestroy();
    };
    return store;
  };
