import { setActiveSub } from 'alien-signals';
import * as alienSignalsSystem from 'alien-signals/system';
import type { Link, ReactiveNode } from 'alien-signals/system';
import {
  beginReactiveSubscriberTrack,
  disposeReactiveSubscriber,
  endReactiveSubscriberTrack,
  registerReactiveSubscriber
} from './reactivePath';

const ReactiveFlags = (
  alienSignalsSystem as unknown as {
    ReactiveFlags: {
      Mutable: number;
      Watching: number;
      RecursedCheck: number;
      Dirty: number;
    };
  }
).ReactiveFlags;

type ReactiveTrackerNode = ReactiveNode & {
  fn: () => void;
};

export type ReactiveTracker = {
  getSnapshot: () => number;
  hasDependencies: () => boolean;
  subscribe: (listener: () => void) => () => void;
  track: <T>(fn: () => T) => T;
  dispose: () => void;
};

const unwatch = (node: ReactiveNode) => {
  if (!(node.flags & ReactiveFlags.Mutable)) {
    node.depsTail = undefined;
    node.flags = 0;
    purgeDeps(node);
    const sub = node.subs;
    if (sub !== undefined) {
      unlink(sub);
    }
    return;
  }
  if (node.depsTail !== undefined) {
    node.depsTail = undefined;
    node.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    purgeDeps(node);
  }
};

const unlink = (link: Link, sub = link.sub) => {
  const dep = link.dep;
  const prevDep = link.prevDep;
  const nextDep = link.nextDep;
  const nextSub = link.nextSub;
  const prevSub = link.prevSub;

  if (nextDep !== undefined) {
    nextDep.prevDep = prevDep;
  } else {
    sub.depsTail = prevDep;
  }
  if (prevDep !== undefined) {
    prevDep.nextDep = nextDep;
  } else {
    sub.deps = nextDep;
  }
  if (nextSub !== undefined) {
    nextSub.prevSub = prevSub;
  } else {
    dep.subsTail = prevSub;
  }
  if (prevSub !== undefined) {
    prevSub.nextSub = nextSub;
  } else if ((dep.subs = nextSub) === undefined) {
    unwatch(dep);
  }
  return nextDep;
};

/** @internal Unlink dependencies using the same lifecycle rules as trackers. */
export const purgeDeps = (sub: ReactiveNode) => {
  const depsTail = sub.depsTail;
  let dep = depsTail !== undefined ? depsTail.nextDep : sub.deps;
  while (dep !== undefined) {
    dep = unlink(dep, sub);
  }
};

/**
 * Create a low-level signal dependency tracker for framework adapters.
 *
 * @remarks
 * Adapter and framework authors import this helper from `coaction/adapter`.
 */
export const createReactiveTracker = (): ReactiveTracker => {
  let version = 0;
  let disposed = false;
  let tracking = false;
  const listeners = new Set<() => void>();
  let trackedTail: Link | undefined;
  const node: ReactiveTrackerNode = {
    deps: undefined,
    depsTail: undefined,
    subs: undefined,
    subsTail: undefined,
    flags: ReactiveFlags.Watching,
    fn: () => {
      if (disposed) {
        return;
      }
      // alien-signals runs a notified subscriber as it runs an effect: it
      // clears the dependency tail first and afterwards purges every link the
      // callback did not read again. A tracker re-tracks on its own schedule --
      // the next render or selector refresh -- so it keeps the links it
      // tracked, and that pass reuses them in place.
      node.depsTail = trackedTail;
      version += 1;
      listeners.forEach((listener) => listener());
    }
  };
  registerReactiveSubscriber(node);
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    listeners.clear();
    trackedTail = undefined;
    node.depsTail = undefined;
    purgeDeps(node);
    node.flags = 0;
    // A callback disposing its own tracker can read on. Those reads stay in its
    // collection, discarded when it unwinds, rather than becoming links of
    // whichever subscriber is left active.
    if (!tracking) disposeReactiveSubscriber(node);
  };
  return {
    getSnapshot: () => version,
    hasDependencies: () => !disposed && node.deps !== undefined,
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    track(fn) {
      if (disposed) {
        return fn();
      }
      const nested = tracking;
      tracking = true;
      beginReactiveSubscriberTrack(node);
      // alien-signals takes a link that is already the last one on its
      // dependency and stamped with the current cycle for a repeat read of this
      // pass, and skips it. A tracker re-tracks outside alien-signals' own
      // runs, so the cycle can still be the one its previous pass ran in: a
      // dependency read in another order would be skipped, then purged as
      // unread. Only this pass's links may carry the cycle.
      // A reentrant call continues that pass, so it keeps them.
      if (!nested) {
        for (let link = node.deps; link !== undefined; link = link.nextDep) {
          link.version = -1;
        }
        node.depsTail = undefined;
        node.flags = ReactiveFlags.Watching | ReactiveFlags.RecursedCheck;
      }
      const prevSub = setActiveSub(node);
      try {
        return fn();
      } finally {
        try {
          // Finalize provisional object-path dependencies while this tracker is
          // still active so surviving terminal paths can establish signal links.
          if (disposed && !nested) disposeReactiveSubscriber(node);
          else endReactiveSubscriberTrack(node);
        } finally {
          setActiveSub(prevSub);
          if (!nested) {
            tracking = false;
            node.flags &= ~ReactiveFlags.RecursedCheck;
            // Nothing a callback read after disposing itself may survive it.
            if (disposed) node.depsTail = undefined;
            purgeDeps(node);
            trackedTail = node.depsTail;
          }
        }
      }
    },
    dispose
  };
};
