import { onStoreReady, type Middleware, type Store } from 'coaction';

type Snapshot = Record<PropertyKey, unknown>;

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter(
    (key) =>
      Object.prototype.propertyIsEnumerable.call(value, key) &&
      !isUnsafeKey(key)
  );

const setOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown
) => {
  if (isUnsafeKey(key)) {
    return;
  }
  target[key] = value;
};

const isObjectRecord = (value: object) =>
  Object.prototype.toString.call(value) === '[object Object]';

const toSnapshot = (
  state: unknown,
  visited = new WeakMap<object, unknown>()
): Snapshot => {
  if (Array.isArray(state)) {
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: unknown[] = [];
    next.length = state.length;
    visited.set(state, next);
    const stateRecord = state as unknown as Record<PropertyKey, unknown>;
    const nextRecord = next as unknown as Record<PropertyKey, unknown>;
    for (const key of getOwnEnumerableKeys(state)) {
      const value = stateRecord[key];
      if (typeof value === 'function') {
        continue;
      }
      setOwnEnumerable(nextRecord, key, toSnapshot(value, visited));
    }
    return next as unknown as Snapshot;
  }
  if (typeof state === 'object' && state !== null) {
    if (!isObjectRecord(state)) {
      return state as Snapshot;
    }
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: Record<PropertyKey, unknown> = {};
    visited.set(state, next);
    for (const key of getOwnEnumerableKeys(state)) {
      const value = (state as Record<PropertyKey, unknown>)[key];
      if (typeof value === 'function') {
        continue;
      }
      setOwnEnumerable(next, key, toSnapshot(value, visited));
    }
    return next;
  }
  return state as Snapshot;
};

const isEqual = (
  a: unknown,
  b: unknown,
  visited = new WeakMap<object, WeakSet<object>>()
): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray || a.length !== b.length) {
      return false;
    }
  } else if (!isObjectRecord(a) || !isObjectRecord(b)) {
    return false;
  }
  let seenTargets = visited.get(a);
  if (!seenTargets) {
    seenTargets = new WeakSet<object>();
    visited.set(a, seenTargets);
  } else if (seenTargets.has(b)) {
    return true;
  }
  seenTargets.add(b);
  const aObject = a as Record<PropertyKey, unknown>;
  const bObject = b as Record<PropertyKey, unknown>;
  const aKeys = getOwnEnumerableKeys(aObject);
  const bKeys = getOwnEnumerableKeys(bObject);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObject, key)) {
      return false;
    }
    if (!isEqual(aObject[key], bObject[key], visited)) {
      return false;
    }
  }
  return true;
};

const hasCircularReference = (
  value: unknown,
  ancestors = new WeakSet<object>(),
  seen = new WeakSet<object>()
): boolean => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!Array.isArray(value) && !isObjectRecord(value)) {
    return false;
  }
  if (ancestors.has(value)) {
    return true;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  ancestors.add(value);
  for (const key of getOwnEnumerableKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (
      typeof child !== 'function' &&
      hasCircularReference(child, ancestors, seen)
    ) {
      return true;
    }
  }
  ancestors.delete(value);
  return false;
};

const applySnapshot = (
  target: Record<PropertyKey, unknown>,
  nextState: object,
  currentState: object
) => {
  const next = nextState as Record<PropertyKey, unknown>;
  const current = currentState as Record<PropertyKey, unknown>;
  const snapshotVisited = new WeakMap<object, unknown>();
  snapshotVisited.set(nextState, target);
  if (Array.isArray(target) && Array.isArray(nextState)) {
    target.length = nextState.length;
  }
  for (const key of getOwnEnumerableKeys(current)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      delete target[key];
    }
  }
  for (const key of getOwnEnumerableKeys(next)) {
    setOwnEnumerable(target, key, toSnapshot(next[key], snapshotVisited));
  }
};

const isPatchableObject = (
  value: unknown
): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  isObjectRecord(value);

const applyPartialSnapshot = (
  target: Record<PropertyKey, unknown>,
  nextState: object,
  currentState: object,
  visited = new WeakMap<object, WeakSet<object>>(),
  snapshotVisited = new WeakMap<object, unknown>()
) => {
  if (!snapshotVisited.has(nextState)) {
    snapshotVisited.set(nextState, target);
  }
  let seenCurrentStates = visited.get(nextState);
  if (!seenCurrentStates) {
    seenCurrentStates = new WeakSet<object>();
    visited.set(nextState, seenCurrentStates);
  } else if (seenCurrentStates.has(currentState)) {
    return;
  }
  seenCurrentStates.add(currentState);
  const next = nextState as Record<PropertyKey, unknown>;
  const current = currentState as Record<PropertyKey, unknown>;
  if (Array.isArray(target) && Array.isArray(nextState)) {
    target.length = nextState.length;
  }
  for (const key of getOwnEnumerableKeys(current)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      delete target[key];
    }
  }
  for (const key of getOwnEnumerableKeys(next)) {
    const nextValue = next[key];
    const currentValue = current[key];
    const targetValue = target[key];
    if (
      isPatchableObject(nextValue) &&
      isPatchableObject(currentValue) &&
      isPatchableObject(targetValue)
    ) {
      applyPartialSnapshot(
        targetValue as Record<PropertyKey, unknown>,
        nextValue,
        currentValue,
        visited,
        snapshotVisited
      );
      continue;
    }
    setOwnEnumerable(target, key, toSnapshot(nextValue, snapshotVisited));
  }
};

const cloneSnapshotList = (snapshots: object[]) =>
  snapshots.map((snapshot) => toSnapshot(snapshot));

export type HistoryOptions<T extends object> = {
  limit?: number;
  partialize?: (state: T) => object;
};

export type HistoryApi<T extends object> = {
  undo: () => boolean;
  redo: () => boolean;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getPast: () => object[];
  getFuture: () => object[];
};

export const history =
  <T extends object>(options: HistoryOptions<T> = {}): Middleware<T> =>
  (store: Store<T>) => {
    if (store.share === 'client') {
      throw new Error(
        'history() is not supported in client store mode. Apply history() to the main shared store instead.'
      );
    }
    const { limit = 100, partialize = (state: T) => state } = options;
    const applyHistorySnapshot = options.partialize
      ? applyPartialSnapshot
      : applySnapshot;
    const applyStore = (store as { apply?: Store<T>['apply'] }).apply?.bind(
      store
    );
    const past: object[] = [];
    const future: object[] = [];
    let isTimeTraveling = false;
    let isSetStateRecording = false;
    let lastSnapshot: object | undefined;
    let unsubscribeStore: (() => void) | undefined;
    const getSnapshot = () => toSnapshot(partialize(store.getPureState()));
    const pushPast = (snapshot: object) => {
      past.push(snapshot);
      if (past.length > limit) {
        past.shift();
      }
    };
    const recordChange = (previous: object, current: object) => {
      if (!isEqual(previous, current)) {
        pushPast(previous);
        future.length = 0;
      }
      lastSnapshot = current;
    };
    const applyTimeTravelSnapshot = (snapshot: object, current: object) => {
      if (applyStore && hasCircularReference(snapshot)) {
        const nextState = toSnapshot(store.getPureState());
        applyHistorySnapshot(
          nextState as Record<PropertyKey, unknown>,
          snapshot,
          current
        );
        applyStore(nextState as T);
        return;
      }
      baseSetState((draft) => {
        applyHistorySnapshot(
          draft as unknown as Record<PropertyKey, unknown>,
          snapshot,
          current
        );
      });
    };
    const cancelReadySubscription = onStoreReady(store, () => {
      lastSnapshot = getSnapshot();
      unsubscribeStore = store.subscribe(() => {
        const current = getSnapshot();
        if (isSetStateRecording || isTimeTraveling) {
          lastSnapshot = current;
          return;
        }
        recordChange(lastSnapshot ?? current, current);
      });
    });
    const baseSetState = store.setState;
    store.setState = (next, updater) => {
      const previous = getSnapshot();
      isSetStateRecording = true;
      let result: ReturnType<typeof baseSetState>;
      try {
        result = baseSetState(next, updater);
      } finally {
        isSetStateRecording = false;
      }
      if (isTimeTraveling) {
        lastSnapshot = getSnapshot();
        return result;
      }
      const current = getSnapshot();
      recordChange(previous, current);
      return result;
    };
    const api: HistoryApi<T> = {
      undo: () => {
        const previous = past.pop();
        if (!previous) {
          return false;
        }
        const current = getSnapshot();
        future.push(current);
        isTimeTraveling = true;
        try {
          applyTimeTravelSnapshot(previous, current);
        } catch (error) {
          future.pop();
          past.push(previous);
          throw error;
        } finally {
          isTimeTraveling = false;
        }
        return true;
      },
      redo: () => {
        const next = future.pop();
        if (!next) {
          return false;
        }
        const current = getSnapshot();
        past.push(current);
        isTimeTraveling = true;
        try {
          applyTimeTravelSnapshot(next, current);
        } catch (error) {
          past.pop();
          future.push(next);
          throw error;
        } finally {
          isTimeTraveling = false;
        }
        return true;
      },
      clear: () => {
        past.length = 0;
        future.length = 0;
      },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      getPast: () => cloneSnapshotList(past),
      getFuture: () => cloneSnapshotList(future)
    };
    Object.assign(store, {
      history: api
    });
    if (typeof store.destroy === 'function') {
      const baseDestroy = store.destroy;
      let destroyed = false;
      store.destroy = () => {
        if (destroyed) {
          return;
        }
        destroyed = true;
        cancelReadySubscription();
        unsubscribeStore?.();
        unsubscribeStore = undefined;
        baseDestroy();
      };
    }
    return store;
  };
