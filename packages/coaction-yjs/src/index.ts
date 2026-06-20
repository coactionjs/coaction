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
import { clone, isPlainObject, scheduleMicrotask } from './shared';
import { syncObjectToYMap } from './sync';
import { createYMap, toPlainObject } from './yjsValue';

export * from 'yjs';

const STATE_KEY = 'state';

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const formatPropertyPath = (path: PropertyKey[]) =>
  path.length ? path.map((key) => String(key)).join('.') : '<root>';

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

const assertYjsSerializableState = (state: unknown) => {
  const violation = findYjsStateViolation(state);
  if (!violation) {
    return;
  }
  if (violation.type === 'symbol-key') {
    throw new Error(
      `Yjs binding does not support symbol-keyed state because Y.Map keys are strings. Found symbol key at ${formatPropertyPath(violation.path)}.`
    );
  }
  if (violation.type === 'symbol-value') {
    throw new Error(
      `Yjs binding does not support symbol-valued state because symbols cannot be cloned into Yjs documents. Found symbol value at ${formatPropertyPath(violation.path)}.`
    );
  }
  throw new Error(
    `Yjs binding does not support ${violation.type} state because only plain objects, arrays, and primitive values round-trip through Yjs updates. Found unsupported value at ${formatPropertyPath(violation.path)}.`
  );
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

  const applyRemoteState = (state: Record<string, unknown>) => {
    const next = clone(state);
    syncingFromYjs = true;
    try {
      store.setState(null);
      store.apply(next as T);
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
    assertYjsSerializableState(store.getPureState());
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
  const existingStateMap = getStateMap();
  if (existingStateMap) {
    stateMap = existingStateMap;
    applyRemoteState(toPlainObject(stateMap));
  } else {
    const currentState = map.get(STATE_KEY);
    if (isPlainObject(currentState)) {
      stateMap = createYMap(currentState);
      doc.transact(() => {
        map.set(STATE_KEY, stateMap);
      }, localOrigin);
      applyRemoteState(currentState);
    } else {
      const pureState = clone(store.getPureState());
      stateMap = createYMap(isPlainObject(pureState) ? pureState : {});
      doc.transact(() => {
        map.set(STATE_KEY, stateMap);
      }, localOrigin);
    }
  }
  stateMap.observeDeep(stateObserver);

  const observer = (event: Y.YMapEvent<any>) => {
    if (event.transaction.origin === localOrigin) {
      return;
    }
    if (!event.keysChanged.has(STATE_KEY)) {
      return;
    }
    const nextStateMap = getStateMap();
    if (nextStateMap) {
      if (stateMap !== nextStateMap) {
        stateMap.unobserveDeep(stateObserver);
        stateMap = nextStateMap;
        stateMap.observeDeep(stateObserver);
      }
      enqueueSnapshot(toPlainObject(nextStateMap));
      return;
    }
    const currentState = map.get(STATE_KEY);
    if (isPlainObject(currentState)) {
      const migrated = createYMap(currentState);
      doc.transact(() => {
        map.set(STATE_KEY, migrated);
      }, localOrigin);
      if (stateMap !== migrated) {
        stateMap.unobserveDeep(stateObserver);
        stateMap = migrated;
        stateMap.observeDeep(stateObserver);
      }
      enqueueSnapshot(currentState);
    }
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
      stateMap.unobserveDeep(stateObserver);
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
    store.destroy = () => {
      cancelBinding();
      binding?.destroy();
      baseDestroy();
    };
    return store;
  };
