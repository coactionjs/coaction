# @coaction/history

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/history.svg)](https://www.npmjs.com/package/@coaction/history) ![license](https://img.shields.io/npm/l/@coaction/history)

[English documentation](https://coactionjs.github.io/coaction/en/docs/) · [中文文档](https://coactionjs.github.io/coaction/zh/docs/)

Patch-based undo/redo middleware for Coaction, powered by
[Travels](https://github.com/mutativejs/travels).

With Travels 2.1 or newer, whole-store commits hand the core-generated patch
pair directly to a controlled Travels journal; partialized histories derive one
patch pair over the tracked projection. Retained history scales with recorded
changes instead of whole-store snapshots. Travels 2.0 remains supported through
a patch-replay adapter, while legacy snapshots are reserved for values such as
cyclic graphs, `Date`, sparse arrays, symbol keys, and custom prototypes.

## Installation

Install it with pnpm:

```sh
pnpm add coaction @coaction/history
```

## Usage

```ts
import { create } from 'coaction';
import { history, type HistoryApi } from '@coaction/history';

type Counter = {
  count: number;
  increment: () => void;
};

const store = create<Counter>(
  (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }),
  {
    middlewares: [history()]
  }
);

store.getState().increment();
const timeline = (store as typeof store & { history: HistoryApi<Counter> })
  .history;

timeline.undo();
timeline.redo();
```

## API

| Method         | Description                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `undo()`       | Moves back one entry and returns whether the cursor moved.                                         |
| `redo()`       | Moves forward one entry and returns whether the cursor moved.                                      |
| `canUndo()`    | Reports whether an undo entry is available.                                                        |
| `canRedo()`    | Reports whether a redo entry is available.                                                         |
| `clear()`      | Rebases the timeline at the current state.                                                         |
| `getPast()`    | Reconstructs and returns detached past snapshots for compatibility.                                |
| `getFuture()`  | Reconstructs and returns detached future snapshots for compatibility.                              |
| `getPatches()` | Returns the Travels-backed patch groups and cursor, or `undefined` in snapshot compatibility mode. |

`getPast()` and `getFuture()` materialize snapshots lazily. Keep them out of
render and update hot paths when only `canUndo()` or `canRedo()` is needed.

`getPatches()` exposes the compact durable shape without reconstructing every
state:

```ts
const patches = timeline.getPatches();

if (patches) {
  const payload = {
    state: store.getPureState(),
    ...patches
  };
  localStorage.setItem('counter-history', JSON.stringify(payload));
}
```

The returned patch arrays are detached from the internal timeline. The shape is
`{ patches, inversePatches, position }`, where both patch fields contain one
group per history entry.

## Partial history

Use `partialize` to track a JSON-compatible projection while leaving other
state untouched:

```ts
history<Counter>({
  limit: 50,
  partialize: (state) => ({ count: state.count })
});
```

Travels stores patches over the projected state. Undo and redo apply only those
projected fields through Coaction's normal middleware and subscription pipeline.
Untracked state can contain runtime-only or cyclic values without forcing the
tracked projection into snapshot mode.

## Compatibility behavior

- JSON-compatible whole-store and partialized histories use Travels patches.
- The declared `travels@^2.0.0` range is intentional. Travels 2.1 and newer use
  the controlled journal and direct `recordPatches()` handoff. Travels 2.0 uses
  a feature-detected patch-replay fallback with the same history API and
  behavior, but performs additional local patch application and rollback work.
- Fresh installs resolve the latest compatible Travels 2.x release. An existing
  lockfile may keep 2.0.x and the fallback until the application updates the
  transitive dependency, for example with `pnpm update travels`.
- If tracked state becomes non-JSON-compatible, the existing timeline is
  materialized once and recording continues with legacy snapshots.
- In snapshot compatibility mode, `getPatches()` returns `undefined` while the
  other history methods keep their previous behavior.
- Install history on the authoritative main store. Client mirror stores reject
  local history because it would diverge from their authority.
- `limit` defaults to `100` and must be a non-negative integer.

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).
