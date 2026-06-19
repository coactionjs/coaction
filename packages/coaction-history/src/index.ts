import type { Middleware, Store } from 'coaction';

type Snapshot = Record<PropertyKey, unknown>;

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const toSnapshot = (
  state: unknown,
  visited = new WeakMap<object, unknown>()
): Snapshot => {
  if (Array.isArray(state)) {
    if (visited.has(state)) {
      return visited.get(state) as Snapshot;
    }
    const next: unknown[] = [];
    visited.set(state, next);
    for (const item of state) {
      next.push(toSnapshot(item, visited));
    }
    return next as unknown as Snapshot;
  }
  if (typeof state === 'object' && state !== null) {
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
      next[key] = toSnapshot(value, visited);
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
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (!isEqual(a[index], b[index], visited)) {
        return false;
      }
    }
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

const applySnapshot = (
  target: Record<PropertyKey, unknown>,
  nextState: object,
  currentState: object
) => {
  const next = nextState as Record<PropertyKey, unknown>;
  const current = currentState as Record<PropertyKey, unknown>;
  for (const key of getOwnEnumerableKeys(current)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      delete target[key];
    }
  }
  for (const key of getOwnEnumerableKeys(next)) {
    target[key] = toSnapshot(next[key]);
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
  <T extends object>({
    limit = 100,
    partialize = (state: T) => state
  }: HistoryOptions<T> = {}): Middleware<T> =>
  (store: Store<T>) => {
    const past: object[] = [];
    const future: object[] = [];
    let isTimeTraveling = false;
    const getSnapshot = () => toSnapshot(partialize(store.getPureState()));
    const pushPast = (snapshot: object) => {
      past.push(snapshot);
      if (past.length > limit) {
        past.shift();
      }
    };
    const baseSetState = store.setState;
    store.setState = (next, updater) => {
      const previous = getSnapshot();
      const result = baseSetState(next, updater);
      if (isTimeTraveling) {
        return result;
      }
      const current = getSnapshot();
      if (!isEqual(previous, current)) {
        pushPast(previous);
        future.length = 0;
      }
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
          baseSetState((draft) => {
            applySnapshot(
              draft as unknown as Record<PropertyKey, unknown>,
              previous,
              current
            );
          });
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
          baseSetState((draft) => {
            applySnapshot(
              draft as unknown as Record<PropertyKey, unknown>,
              next,
              current
            );
          });
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
    return store;
  };
