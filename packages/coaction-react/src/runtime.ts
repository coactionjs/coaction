import * as React from 'react';
import {
  createReactiveTracker,
  getReadonlyStateValueVersion,
  trackReadonlyStateValue,
  type ReactiveTracker,
  wrapStore
} from 'coaction/adapter';
import type {
  Asyncify,
  ISlices,
  LocalStoreOptions,
  Slice,
  SliceState,
  Store,
  StoreOptions
} from 'coaction';
// Only the shared entry publishes the client-mode option type. The import is
// type-only, so naming it here does not pull the transport build into the
// default one.
import type { ClientStoreOptions } from 'coaction/shared';
// Keep the shim so one published build works across React 17/18/19.
// Switching to `react` directly would be a breaking change for React 17 users.
import { useSyncExternalStore } from 'use-sync-external-store/shim';

type SelectorOptions = {
  autoSelector?: boolean;
};

/**
 * Run a selector over the store's plain data, tracking nothing.
 *
 * @remarks
 * The selector receives `getPureState()`: the store's own data as plain
 * objects -- no getters, no methods -- read at plain-object speed, the way
 * `whole()` reads one value. It depends on the whole store: every commit runs
 * it again, and the component re-renders only when `equals` says the result
 * changed. Use it for a selector that scans most of the state anyway, where
 * tracking each read costs more than running the scan again. Read what it is
 * given; never mutate it.
 */
export type WholeSelectorOptions<P> = {
  whole: true;
  /**
   * Whether two results are the same. Defaults to `Object.is`. While it holds,
   * the component keeps the earlier result and does not re-render.
   */
  equals?: (previous: P, next: P) => boolean;
};

type SelectorFn<TState extends object, TValue> = (state: TState) => TValue;
type ObserverRender<P extends object> = ((props: P) => React.ReactNode) & {
  displayName?: string;
  name?: string;
};
type ObserverTrackerState = {
  getSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
  commit: () => void;
  track: <T>(render: () => T) => T;
};
type TrackedRender = {
  tracker: ReactiveTracker;
  snapshot: number;
};
/** A state value a selector result carried out, with the version it had. */
type CarriedStateValue = { value: object; version: number };
type TrackedSelection<TState extends object, TValue> = TrackedRender & {
  selector: SelectorFn<TState, TValue>;
  value: TValue;
  stateObjectVersion?: number;
  carried?: CarriedStateValue[];
  reactive: boolean;
};

/**
 * Whether the state values a selector result carries have changed.
 *
 * Identity as well as version: a version is a sum of path versions, so two
 * objects that have not been written to share one. A selector that swaps which
 * sibling it carries -- `useA ? state.a : state.b` -- would otherwise compare
 * equal, and with a reused wrapper there is nothing else left to compare.
 */
const carriedChanged = (
  previous: CarriedStateValue[] | undefined,
  next: CarriedStateValue[] | undefined
) => {
  if (previous === undefined || next === undefined) {
    return previous !== next;
  }
  if (previous.length !== next.length) return true;
  return next.some(
    (entry, index) =>
      entry.value !== previous[index].value ||
      entry.version !== previous[index].version
  );
};
type SelectorTrackerState<TState extends object> = {
  getSnapshot: () => number;
  getServerSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
  track: <TValue>(selector: SelectorFn<TState, TValue>) => TValue;
  commit: () => void;
};

let observerRenderDepth = 0;
// A render may never commit (Suspense, StrictMode replay, a discarded
// transition), so a tracker created during one is held for a while before its
// path nodes are released.
const observerUncommittedCleanupMs = 10_000;
// Once React drops the last subscriber the component is unmounted or hidden,
// which is a definite signal rather than a guess, so its path nodes are
// released on the next macrotask instead. Anything that resubscribes -- the
// second half of a StrictMode replay, a remounted Offscreen subtree -- cancels
// the pending release synchronously, before a timer can run.
const observerReleaseCleanupMs = 0;

/**
 * Pending tracker releases for one delay. Every component's first render
 * schedules one and almost every commit cancels it, so the queue keeps a single
 * timer for its oldest live entry instead of arming and clearing a timer per
 * render. Entries of one delay are queued in due order, which is what lets the
 * head's timer release each entry exactly when its own delay ends.
 */
type CleanupEntry = {
  due: number;
  run: (() => void) | undefined;
  queue: CleanupQueue;
};
type CleanupQueue = {
  delayMs: number;
  entries: CleanupEntry[];
  head: number;
  timer?: ReturnType<typeof setTimeout>;
};

const createCleanupQueue = (delayMs: number): CleanupQueue => ({
  delayMs,
  entries: [],
  head: 0
});

const armCleanupQueue = (queue: CleanupQueue) => {
  const { entries } = queue;
  while (queue.head < entries.length && !entries[queue.head].run) {
    queue.head += 1;
  }
  if (queue.head * 2 > entries.length) {
    entries.splice(0, queue.head);
    queue.head = 0;
  }
  if (queue.head === entries.length) {
    return;
  }
  const timer = setTimeout(
    () => {
      // The timer stays set while releases run, so one they cause does not arm
      // a second timer; the queue re-arms once, whatever a release throws.
      try {
        const now = Date.now();
        while (queue.head < entries.length) {
          const entry = entries[queue.head];
          if (entry.run && entry.due > now) break;
          queue.head += 1;
          const run = entry.run;
          entry.run = undefined;
          run?.();
        }
      } finally {
        queue.timer = undefined;
        armCleanupQueue(queue);
      }
    },
    Math.max(0, entries[queue.head].due - Date.now())
  );
  (timer as { unref?: () => void }).unref?.();
  queue.timer = timer;
};

const uncommittedCleanups = createCleanupQueue(observerUncommittedCleanupMs);
const releaseCleanups = createCleanupQueue(observerReleaseCleanupMs);

/** Run `run` once the delay ends, unless the entry is cancelled first. */
const scheduleCleanup = (delayMs: number, run: () => void) => {
  const queue =
    delayMs === observerReleaseCleanupMs
      ? releaseCleanups
      : uncommittedCleanups;
  const entry: CleanupEntry = { due: Date.now() + queue.delayMs, run, queue };
  queue.entries.push(entry);
  if (queue.timer === undefined) {
    armCleanupQueue(queue);
  }
  return entry;
};

/**
 * Cancel a pending release. A commit cancels the entry its own render queued,
 * normally the newest one, so cancelled entries at the end of the queue are
 * dropped at once rather than held until the oldest entry's timer runs -- for
 * as long as ten seconds, one per render.
 */
const cancelCleanup = (entry: CleanupEntry) => {
  entry.run = undefined;
  const { entries } = entry.queue;
  while (
    entries.length > entry.queue.head &&
    !entries[entries.length - 1].run
  ) {
    entries.pop();
  }
};

const isObserverRendering = () => observerRenderDepth > 0;

const isReactNativeEnvironment = () =>
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

const canTrackObserverRender = () =>
  typeof window !== 'undefined' || isReactNativeEnvironment();

const useObserverCommitEffect =
  canTrackObserverRender() && React.useLayoutEffect
    ? React.useLayoutEffect
    : React.useEffect;

const runObserverRender = <T>(render: () => T) => {
  observerRenderDepth += 1;
  try {
    return render();
  } finally {
    observerRenderDepth -= 1;
  }
};

/**
 * Record the state values a selector result carries, and fold their versions
 * into one token.
 *
 * The dependency alone is not enough when the result is a wrapper the selector
 * reuses. The subscription fires, the selector runs again, and the comparison
 * then sees the same wrapper reference and concludes nothing changed -- exactly
 * what `stateObjectVersion` already compensates for when the state value is
 * returned directly. The fold is sensitive to each version, to how many values
 * there are, and to the order they were found in.
 */
const trackReturnedStateValues = (value: unknown) => {
  const carried: CarriedStateValue[] = [];
  // Only what is below the value can be reached twice -- through a shared
  // reference or a cycle -- so the set that stops a revisit is created on the
  // first step down. A leaf result, an element with primitive props, needs none.
  // The set lives for one walk, so it holds its objects strongly.
  let seen: Set<object> | undefined;
  let root = true;
  const visit = (current: unknown) => {
    // State facades, readonly views and the values the state hands out are all
    // objects, so a function -- an event handler, a callback prop -- is never
    // state and holds none.
    if (typeof current !== 'object' || current === null) {
      return;
    }
    if (root) {
      root = false;
    } else {
      seen ??= new Set<object>();
      if (seen.has(current)) return;
      seen.add(current);
    }
    const element = React.isValidElement(current);
    // A Coaction state proxy/facade is already a terminal path dependency.
    // Do not traverse large state arrays/objects merely because they escaped
    // through a React prop. A value the state hands out as itself -- an array
    // element -- is state too: its version is constant, so it is carried by
    // its identity. A rendered element is neither: only an element the state
    // holds can be, and the state freezes what it hands out, while production
    // builds leave rendered elements unfrozen.
    if (!element || Object.isFrozen(current)) {
      if (trackReadonlyStateValue(current)) {
        const version = getReadonlyStateValueVersion(current);
        if (version !== undefined) carried.push({ value: current, version });
        return;
      }
    }
    // React copies props in with `for...in`, so that lists all of them, and
    // leaves out the non-enumerable `key` and `ref` warning getters of
    // development builds.
    if (element) {
      const props = current.props as Record<string, unknown> | null;
      if (props) {
        for (const key in props) visit(props[key]);
      }
      return;
    }
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index++) {
        visit(current[index]);
      }
      return;
    }
    // A plain object the caller built -- `{ user: state.user, name: ... }` --
    // carries state values out with it. Without walking it, reading a deeper
    // leaf makes path minimisation drop the ancestor as a mere traversal step,
    // and the object in the result then never invalidates. Traversal stops at
    // the first state value, so this only walks what the caller wrote.
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) return;
    const record = current as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(record)) {
      visit(record[key]);
    }
  };
  visit(value);
  return carried;
};

const getObserverDisplayName = (Component: ObserverRender<object>) =>
  Component.displayName ?? Component.name ?? 'Component';

const createObserverTrackerState = (): ObserverTrackerState => {
  let activeTracker: ReactiveTracker | undefined;
  // The tracker the last commit replaced. A render re-tracks it instead of
  // creating a tracker, so its registration and path-node counts carry over.
  let spareTracker: ReactiveTracker | undefined;
  let activeUnsubscribe: (() => void) | undefined;
  let activeSnapshot: number | undefined;
  let latestRender: TrackedRender | undefined;
  let version = 0;
  const listeners = new Set<() => void>();
  const cleanupHandles = new Map<ReactiveTracker, CleanupEntry>();

  const notify = (snapshot?: number) => {
    if (activeTracker) {
      activeSnapshot = snapshot ?? activeTracker.getSnapshot();
    }
    version += 1;
    listeners.forEach((listener) => listener());
  };
  const syncActiveSnapshot = () => {
    if (!activeTracker || activeSnapshot === undefined) {
      return;
    }
    const snapshot = activeTracker.getSnapshot();
    if (snapshot !== activeSnapshot) {
      notify(snapshot);
    }
  };
  const clearTrackerCleanup = (tracker: ReactiveTracker) => {
    const entry = cleanupHandles.get(tracker);
    if (entry !== undefined) {
      cancelCleanup(entry);
      cleanupHandles.delete(tracker);
    }
  };
  const disposeTracker = (tracker: ReactiveTracker) => {
    clearTrackerCleanup(tracker);
    tracker.dispose();
  };
  const scheduleTrackerCleanup = (
    tracker: ReactiveTracker,
    delayMs = observerUncommittedCleanupMs
  ) => {
    clearTrackerCleanup(tracker);
    if (!canTrackObserverRender()) {
      return;
    }
    const entry = scheduleCleanup(delayMs, () => {
      cleanupHandles.delete(tracker);
      if (activeTracker === tracker) {
        activeUnsubscribe?.();
        activeUnsubscribe = undefined;
        activeTracker = undefined;
        activeSnapshot = undefined;
      }
      if (latestRender?.tracker === tracker) {
        latestRender = undefined;
      }
      tracker.dispose();
    });
    cleanupHandles.set(tracker, entry);
  };
  const disposeSpareTracker = () => {
    if (spareTracker) {
      disposeTracker(spareTracker);
      spareTracker = undefined;
    }
  };
  const unsubscribeActiveTracker = () => {
    activeUnsubscribe?.();
    activeUnsubscribe = undefined;
  };
  const subscribeActiveTracker = () => {
    unsubscribeActiveTracker();
    if (!activeTracker || listeners.size === 0) {
      return;
    }
    activeUnsubscribe = activeTracker.subscribe(notify);
    syncActiveSnapshot();
  };
  return {
    getSnapshot: () => version,
    subscribe(listener) {
      listeners.add(listener);
      if (activeTracker) {
        clearTrackerCleanup(activeTracker);
      }
      if (listeners.size === 1) {
        subscribeActiveTracker();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeActiveTracker();
          if (activeTracker) {
            scheduleTrackerCleanup(activeTracker, observerReleaseCleanupMs);
          }
          disposeSpareTracker();
        }
      };
    },
    commit() {
      if (!latestRender) {
        return;
      }
      const { tracker, snapshot } = latestRender;
      latestRender = undefined;
      clearTrackerCleanup(tracker);
      if (activeTracker !== tracker) {
        const previousTracker = activeTracker;
        unsubscribeActiveTracker();
        activeTracker = tracker;
        activeSnapshot = snapshot;
        subscribeActiveTracker();
        if (listeners.size === 0) {
          scheduleTrackerCleanup(tracker);
        }
        if (previousTracker) {
          disposeSpareTracker();
          clearTrackerCleanup(previousTracker);
          spareTracker = previousTracker;
        }
      }
      syncActiveSnapshot();
    },
    track<T>(render: () => T) {
      if (!canTrackObserverRender()) {
        return runObserverRender(render);
      }
      // A render never re-tracks the committed tracker: it may be discarded --
      // a suspended transition, a StrictMode replay -- and the subscription
      // has to keep the dependencies that were committed. It re-tracks an
      // uncommitted render's tracker or the spare one instead.
      const reused = latestRender?.tracker ?? spareTracker;
      if (reused === spareTracker) {
        spareTracker = undefined;
      }
      const tracker = reused ?? createReactiveTracker();
      // The grace period belongs to this render, which is the one that may
      // never commit, however long ago an earlier render of the tracker began.
      scheduleTrackerCleanup(tracker);
      try {
        const value = tracker.track(() => {
          const rendered = runObserverRender(render);
          trackReturnedStateValues(rendered);
          return rendered;
        });
        latestRender = {
          tracker,
          snapshot: tracker.getSnapshot()
        };
        return value;
      } catch (error) {
        latestRender = {
          tracker,
          snapshot: tracker.getSnapshot()
        };
        throw error;
      }
    }
  };
};

const useObserverTracker = () => {
  const trackerRef = React.useRef<ObserverTrackerState | undefined>(undefined);
  if (!trackerRef.current) {
    trackerRef.current = createObserverTrackerState();
  }
  const trackerState = trackerRef.current;
  useSyncExternalStore(
    trackerState.subscribe,
    trackerState.getSnapshot,
    () => 0
  );
  useObserverCommitEffect(() => {
    trackerState.commit();
  });
  return trackerState;
};

const createSelectorTrackerState = <TState extends object>(
  store: Store<TState>
): SelectorTrackerState<TState> => {
  let activeSelection: TrackedSelection<TState, any> | undefined;
  // As for observers: the tracker the last commit replaced, re-tracked by the
  // next render instead of creating one.
  let spareTracker: ReactiveTracker | undefined;
  let activeUnsubscribe: (() => void) | undefined;
  let latestRender: TrackedSelection<TState, any> | undefined;
  let version = 0;
  const listeners = new Set<() => void>();
  const cleanupHandles = new Map<ReactiveTracker, CleanupEntry>();

  const clearCleanup = (tracker: ReactiveTracker) => {
    const entry = cleanupHandles.get(tracker);
    if (entry !== undefined) {
      cancelCleanup(entry);
      cleanupHandles.delete(tracker);
    }
  };
  const disposeTracker = (tracker: ReactiveTracker | undefined) => {
    if (!tracker) return;
    clearCleanup(tracker);
    tracker.dispose();
  };
  const scheduleSelectionCleanup = (
    selection: TrackedSelection<TState, any>,
    delayMs = observerUncommittedCleanupMs
  ) => {
    clearCleanup(selection.tracker);
    if (!canTrackObserverRender()) return;
    const entry = scheduleCleanup(delayMs, () => {
      cleanupHandles.delete(selection.tracker);
      if (activeSelection?.tracker === selection.tracker) {
        activeUnsubscribe?.();
        activeUnsubscribe = undefined;
        activeSelection = undefined;
      }
      if (latestRender?.tracker === selection.tracker) {
        latestRender = undefined;
      }
      selection.tracker.dispose();
    });
    cleanupHandles.set(selection.tracker, entry);
  };
  const evaluate = <TValue>(
    selector: SelectorFn<TState, TValue>,
    reuse?: ReactiveTracker
  ): TrackedSelection<TState, TValue> => {
    const tracker = reuse ?? createReactiveTracker();
    try {
      let stateObjectVersion: number | undefined;
      let carried: CarriedStateValue[] | undefined;
      const value = tracker.track(() => {
        const selected = selector(store.getState());
        if (trackReadonlyStateValue(selected)) {
          stateObjectVersion = getReadonlyStateValueVersion(selected);
        } else {
          // A composite result carries state values inside a wrapper the
          // selector built; they need the same terminal dependency -- and the
          // same version comparison -- the directly returned one gets, or a
          // wrapper the selector reuses hides every change inside it.
          carried = trackReturnedStateValues(selected);
        }
        return selected;
      });
      return {
        tracker,
        snapshot: tracker.getSnapshot(),
        selector,
        value,
        stateObjectVersion,
        carried,
        reactive: tracker.hasDependencies()
      };
    } catch (error) {
      // A render-time selector may suspend or throw. It never becomes the
      // committed dependency set, so release its path nodes immediately. A
      // re-tracked tracker is released by whoever lent it.
      if (!reuse) tracker.dispose();
      throw error;
    }
  };
  const notify = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };
  const unsubscribeActive = () => {
    activeUnsubscribe?.();
    activeUnsubscribe = undefined;
  };
  /**
   * Point the active subscription at the selection's current source, leaving
   * it alone when the source has not changed. A non-reactive selection stays
   * subscribed to the same store across refreshes, and dropping that listener
   * only to add it straight back is not merely wasted work: stores notify by
   * iterating their listener set, and a listener re-added mid-iteration is
   * visited again by that same iteration, so a selection refreshing on every
   * notification would never stop refreshing.
   */
  const retargetActive = (
    previous: TrackedSelection<TState, any> | undefined,
    next: TrackedSelection<TState, any>
  ) => {
    if (
      activeUnsubscribe &&
      listeners.size &&
      previous &&
      previous.reactive === next.reactive &&
      (!next.reactive || previous.tracker === next.tracker)
    ) {
      return;
    }
    unsubscribeActive();
    if (!listeners.size) return;
    activeUnsubscribe = next.reactive
      ? next.tracker.subscribe(refreshActive)
      : store.subscribe(refreshActive);
  };
  const refreshActive = () => {
    const previous = activeSelection;
    if (!previous) return;
    let next: TrackedSelection<TState, any>;
    try {
      // A refresh is not speculative, so the committed tracker re-tracks in
      // place -- from inside its own notification, which keeps the links the
      // selector reads again.
      next = evaluate(previous.selector, previous.tracker);
    } catch {
      // Surface selector failures from the next React render rather than from
      // an external-store notification callback.
      notify();
      return;
    }
    activeSelection = next;
    retargetActive(previous, next);
    // Public root/slice facades intentionally keep stable identity. Compare
    // their path version as well as object identity so an unrelated selector
    // dependency can change without forcing a state-object result to render.
    const changed =
      !Object.is(previous.value, next.value) ||
      (next.stateObjectVersion !== undefined &&
        next.stateObjectVersion !== previous.stateObjectVersion) ||
      carriedChanged(previous.carried, next.carried);
    if (changed) {
      notify();
    }
  };
  const subscribeActive = () => {
    unsubscribeActive();
    if (!activeSelection || !listeners.size) return;
    activeUnsubscribe = activeSelection.reactive
      ? activeSelection.tracker.subscribe(refreshActive)
      : store.subscribe(refreshActive);
    if (
      activeSelection.reactive &&
      activeSelection.tracker.getSnapshot() !== activeSelection.snapshot
    ) {
      refreshActive();
    }
  };

  return {
    getSnapshot: () => version,
    getServerSnapshot: () => 0,
    subscribe(listener) {
      listeners.add(listener);
      if (activeSelection) clearCleanup(activeSelection.tracker);
      if (listeners.size === 1) subscribeActive();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribeActive();
          if (activeSelection) {
            scheduleSelectionCleanup(activeSelection, observerReleaseCleanupMs);
          }
          disposeTracker(spareTracker);
          spareTracker = undefined;
        }
      };
    },
    track<TValue>(selector: SelectorFn<TState, TValue>) {
      if (!canTrackObserverRender()) {
        // The server has no subscription to keep, but it does have to agree
        // with everything else reading the same store at the same moment.
        // Reading the initial state here made `useStore(s => s.count)` and
        // `useStore().count` report different values on the server whenever
        // anything had written to the store before rendering -- a request
        // preloading data, a hydration middleware, an initialisation second
        // phase -- and left the markup disagreeing with what the client
        // hydrates against.
        return selector(store.getState());
      }
      const reuse = latestRender?.tracker ?? spareTracker;
      if (reuse === spareTracker) {
        spareTracker = undefined;
      }
      let selection: TrackedSelection<TState, TValue>;
      try {
        selection = evaluate(selector, reuse);
      } catch (error) {
        if (latestRender?.tracker === reuse) latestRender = undefined;
        disposeTracker(reuse);
        throw error;
      }
      // As for observers, the grace period starts over with this render.
      scheduleSelectionCleanup(selection);
      latestRender = selection;
      return selection.value;
    },
    commit() {
      const rendered = latestRender;
      if (!rendered) return;
      latestRender = undefined;
      clearCleanup(rendered.tracker);
      let next = rendered;
      let renderedValueStale = false;
      if (
        !rendered.reactive ||
        rendered.tracker.getSnapshot() !== rendered.snapshot
      ) {
        let refreshed: TrackedSelection<TState, any>;
        try {
          refreshed = evaluate(rendered.selector, rendered.tracker);
        } catch (error) {
          disposeTracker(rendered.tracker);
          throw error;
        }
        renderedValueStale =
          !Object.is(rendered.value, refreshed.value) ||
          (refreshed.stateObjectVersion !== undefined &&
            refreshed.stateObjectVersion !== rendered.stateObjectVersion) ||
          carriedChanged(rendered.carried, refreshed.carried);
        next = refreshed;
      }
      const previous = activeSelection;
      activeSelection = next;
      retargetActive(previous, next);
      if (!listeners.size) {
        scheduleSelectionCleanup(next);
      }
      if (previous && previous.tracker !== next.tracker) {
        disposeTracker(spareTracker);
        clearCleanup(previous.tracker);
        spareTracker = previous.tracker;
      }
      if (renderedValueStale) {
        notify();
      }
    }
  };
};

const useTrackedSelector = <TState extends object, TValue>(
  store: Store<TState>,
  selector: SelectorFn<TState, TValue>
) => {
  const trackerRef = React.useRef<SelectorTrackerState<TState> | undefined>(
    undefined
  );
  if (!trackerRef.current) {
    trackerRef.current = createSelectorTrackerState(store);
  }
  const trackerState = trackerRef.current;
  const selected = trackerState.track(selector);
  useSyncExternalStore(
    trackerState.subscribe,
    trackerState.getSnapshot,
    trackerState.getServerSnapshot
  );
  useObserverCommitEffect(() => {
    trackerState.commit();
  });
  return selected;
};

/** No selection made yet, as opposed to one that is `undefined`. */
const unselected = {};

/**
 * Select from the store's plain data, tracking nothing.
 *
 * The selector reads `getPureState()` -- the store's own objects, as `whole()`
 * hands them out -- so a scan pays for no proxy and records no dependency.
 * The selection depends on the whole store instead: each commit runs it again,
 * and the component renders when `equals` says it changed. A store notifies
 * its version listener before any reader, so a selection cached against the
 * version is never read stale, and React asking for it again costs nothing.
 * The version, not the state's identity, is what is compared: an adapter's
 * mutable state keeps its identity across commits.
 */
const useWholeSelector = <TState extends object, TValue>(
  store: Store<TState>,
  subscribe: (listener: () => void) => () => void,
  getVersion: () => number,
  selector: SelectorFn<TState, TValue>,
  equals: (previous: TValue, next: TValue) => boolean = Object.is
) => {
  // The last selection this component made. A new selector -- an inline one
  // is new on every render -- compares its first selection with it, so a
  // value `equals` holds unchanged keeps its identity across renders.
  const last = React.useRef<unknown>(unselected);
  const getSelection = React.useMemo(() => {
    let version = -1;
    let value: TValue;
    return () => {
      const current = getVersion();
      if (version === current) return value;
      const next = selector(store.getPureState());
      const previous = version === -1 ? last.current : value;
      value =
        previous !== unselected && equals(previous as TValue, next)
          ? (previous as TValue)
          : next;
      version = current;
      last.current = value;
      return value;
    };
  }, [store, getVersion, selector, equals]);
  return useSyncExternalStore(subscribe, getSelection, getSelection);
};

export const observer = <P extends object>(
  Component: ObserverRender<P>
): React.MemoExoticComponent<ObserverRender<P>> => {
  const Observed = (props: P) => {
    const trackerState = useObserverTracker();
    return trackerState.track(() => Component(props));
  };
  Observed.displayName = `observer(${getObserverDisplayName(
    Component as ObserverRender<object>
  )})`;
  return React.memo(Observed);
};

export type ObserverProps = {
  children: () => React.ReactNode;
};

export const Observer = observer<ObserverProps>(({ children }) =>
  React.createElement(React.Fragment, null, children())
);

type LeafObject =
  | Date
  | RegExp
  | Error
  | Promise<unknown>
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | ArrayBuffer
  | DataView;

export type AutoSelector<TState extends object, TValue> = SelectorFn<
  TState,
  TValue
> &
  (TValue extends (...args: any[]) => any
    ? {}
    : TValue extends readonly any[]
      ? {}
      : TValue extends LeafObject
        ? {}
        : TValue extends object
          ? {
              [K in keyof TValue]: AutoSelector<TState, TValue[K]>;
            }
          : {});

export type AutoSelectors<T extends object> = {
  [K in keyof T]: AutoSelector<T, T[K]>;
};

export type StoreReturn<T extends object> = Store<T> & {
  <P>(selector: (state: T) => P, options?: WholeSelectorOptions<P>): P;
  (options: { autoSelector: true }): AutoSelectors<T>;
  (options?: SelectorOptions): T;
  auto: () => AutoSelectors<T>;
};

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'getInitialState'> & {
  getInitialState: () => T;
  <P>(
    selector: (state: Asyncify<T, D>) => P,
    options?: WholeSelectorOptions<P>
  ): P;
  (options: { autoSelector: true }): AutoSelectors<Asyncify<T, D>>;
  (options?: SelectorOptions): Asyncify<T, D>;
  auto: () => AutoSelectors<Asyncify<T, D>>;
};

export type CreateState = ISlices | Record<PropertyKey, Slice<any>>;

type SingleStoreOptions<T extends CreateState> = StoreOptions<T> & {
  sliceMode: 'single';
};

type SingleClientStoreOptions<T extends CreateState> = ClientStoreOptions<T> & {
  sliceMode: 'single';
};

type SingleLocalStoreOptions<T extends CreateState> = LocalStoreOptions<T> & {
  sliceMode: 'single';
};

export type Creator = {
  <T extends ISlices>(
    createState: T,
    options: SingleClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
  <T extends ISlices>(
    createState: T,
    options: SingleStoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
};

export type LocalCreator = {
  <T extends ISlices>(
    createState: T,
    options: SingleLocalStoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: LocalStoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: LocalStoreOptions<T>
  ): StoreReturn<T>;
};

const getPathValue = (state: unknown, path: PropertyKey[]) => {
  let current = state as Record<PropertyKey, unknown> | undefined;
  for (const key of path) {
    if (
      (typeof current !== 'object' && typeof current !== 'function') ||
      current === null
    ) {
      return undefined;
    }
    current = current[key] as Record<PropertyKey, unknown> | undefined;
  }
  return current;
};

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const createSelectorNode = <T extends object>(
  path: PropertyKey[],
  value: unknown,
  ancestors: object[] = []
): AutoSelector<T, unknown> => {
  const selector = ((state: T) => {
    return getPathValue(state, path);
  }) as AutoSelector<T, unknown>;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !isPlainObject(value)
  ) {
    return selector;
  }
  if (ancestors.includes(value)) {
    return selector;
  }
  const nextAncestors = [...ancestors, value];
  const childDescriptors = {} as Record<PropertyKey, PropertyDescriptor>;
  for (const key of getOwnEnumerableKeys(value)) {
    childDescriptors[key] = {
      value: createSelectorNode<T>(
        [...path, key],
        (value as Record<PropertyKey, unknown>)[key],
        nextAncestors
      ),
      enumerable: true
    };
  }
  return Object.defineProperties(selector, childDescriptors);
};

const createAutoSelectors = <T extends object>(store: Store<T>) => {
  const state = store.getState();
  if (typeof state !== 'object' || state === null) {
    return {} as AutoSelectors<T>;
  }
  const selectors = {} as Record<PropertyKey, AutoSelector<T, unknown>>;
  for (const key of getOwnEnumerableKeys(state)) {
    selectors[key] = createSelectorNode<T>(
      [key],
      (state as Record<PropertyKey, unknown>)[key]
    );
  }
  return selectors as AutoSelectors<T>;
};

export const createReactStore = (
  createVanilla: (createState: any, options?: any) => Store<any>,
  createState: any,
  options: any
) => {
  const store = createVanilla(createState, options);
  let fullStateVersion = 0;
  const fullStateListeners = new Set<() => void>();
  let isTrackingSubscriptionSetup = true;
  const unsubscribeVersion = store.subscribe(() => {
    if (isTrackingSubscriptionSetup) {
      return;
    }
    fullStateVersion += 1;
    fullStateListeners.forEach((listener) => listener());
  });
  isTrackingSubscriptionSetup = false;
  const baseDestroy = store.destroy;
  let destroyed = false;
  store.destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribeVersion();
    fullStateListeners.clear();
    baseDestroy();
  };
  const subscribeFullState = (listener: () => void) => {
    fullStateListeners.add(listener);
    return () => fullStateListeners.delete(listener);
  };
  const getFullStateVersion = () => fullStateVersion;
  let autoSelectors: AutoSelectors<any> | undefined;
  const getAutoSelectors = () => {
    if (!autoSelectors) {
      autoSelectors = createAutoSelectors(store);
    }
    return autoSelectors;
  };
  const useStore = wrapStore(store, (selector: any, options?: any) => {
    if (typeof selector === 'function') {
      return options?.whole
        ? useWholeSelector(
            store,
            subscribeFullState,
            getFullStateVersion,
            selector,
            options.equals
          )
        : useTrackedSelector(store, selector);
    }
    if (selector?.autoSelector) {
      return getAutoSelectors();
    }
    if (isObserverRendering()) {
      return store.getState();
    }
    useSyncExternalStore(subscribeFullState, getFullStateVersion, () => 0);
    return store.getState();
  }) as StoreReturn<any>;
  useStore.auto = getAutoSelectors;
  return useStore;
};

type ExtractState<T extends StoreReturn<any>[]> = {
  [K in keyof T]: ReturnType<T[K]['getState']>;
};

interface CreateSelector {
  <T extends StoreReturn<any>[]>(
    ...stores: T
  ): <P>(selector: (...args: ExtractState<T>) => P) => P;
}

/**
 * create selector for multiple stores
 */
export const createSelector: CreateSelector = (
  ...stores: StoreReturn<any>[]
) => {
  return (selector: (...args: any[]) => any) => {
    const compositeStore = {
      getState: () => stores.map((store) => store.getState()),
      getInitialState: () => stores.map((store) => store.getInitialState()),
      subscribe: (listener: () => void) => {
        const unsubscribes = stores.map((store) => store.subscribe(listener));
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
      }
    } as unknown as Store<object>;
    return useTrackedSelector(compositeStore, (states: any) =>
      selector.apply(null, states)
    );
  };
};
