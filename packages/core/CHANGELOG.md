# coaction

## 4.2.0

### Minor Changes

- 77b453d: Hand array elements out as values. An element read from the state of a native
  store -- by index, found by a scan or returned by a getter -- is the element
  itself, frozen, rather than a readonly proxy, so it is the same object however
  it was reached, `getPureState()` included. Objects reached through object keys
  are still readonly proxies, and stores bound to another runtime through an
  adapter are unchanged. An object held both in an array and at an object key has
  one public identity, the first it was read with: `state.selected` and
  `state.items[0]` stay the same object, whichever is read first. An element with
  an accessor stays a readonly proxy.

  A reader depends on the identity of the elements it reads: structural sharing
  gives an element a new identity when anything inside it changes, and leaves its
  siblings untouched. Read-only array methods called through the state --
  `filter`, `map`, `find`, `some`, `reduce`, `slice`, `for...of` and the rest --
  take one dependency on the array and run over the array itself instead of
  tracking every element they visit; state read inside a callback is still
  tracked. An `observer()` that renders one field of an element therefore
  re-renders after any write inside that element, and one that renders a scan
  after a write to any element. A selector of the same field or scan result
  re-renders only when its result changes, as before.

  A write to an element outside `set()` throws a `TypeError` from the frozen value
  in strict-mode code, and is silently ignored in sloppy-mode scripts, where the
  readonly proxy threw Coaction's error. The values of the initial state are
  frozen when the store first hands one out, so a store read only through
  `getPureState()` or whole selectors freezes nothing.

  In `coaction/adapter`, `trackReadonlyStateValue()` reports an element read from
  the state as state, and `getReadonlyStateValueVersion()` gives it a constant
  version: the element never changes, a write replaces it. A derived or selector
  result that carries an element keeps propagating its changes even when result
  equality calls the result unchanged.

  See `docs/migration/v4.2.md`.

- a2cff4f: An array's state is its elements. `create()` and `setState({ ... })` now leave
  out an array's named keys and symbols -- `Object.assign(rows, { meta })` -- and
  warn once in development. A recipe's first write to such an array already
  dropped them without a warning, because Mutative and Immer copy only an array's
  elements, so a reader saw them or not depending on whether a write had happened.
  While they lasted they also made each commit's patch a replacement of the whole
  root. Keep such a value in an object beside the array. An array that a recipe
  assigns is stored as it is, and its named keys are not frozen with it. Not
  looking for them makes a write followed by a scan of the array about 9% faster.
- 4db2b62: Read `getInitialState()` from the store's own first root. A native store kept
  the object its factory returned for `getInitialState()`, holding all of its
  data a second time beside the store's own copy for as long as the store lived.
  It now keeps only the factory's methods, accessors and computed definitions,
  and the first call returns a copy of the store's initial data shaped like the
  factory's object: the same keys and attributes, the factory's own functions,
  and data equal to what the factory returned. Every call returns that same
  object, and changing it does not change the store. It is no longer the
  factory's object itself. Stores bound to another runtime, such as MobX or
  Zustand, return what that runtime provided, as before.

### Patch Changes

- 441657a: Track reads and commit local writes with less work. Measured in Node 24 against
  4.1.0, with a store of 1,000 tasks:

  - The first tracked scan of the tasks takes about 40% of the time, and a write
    to one task followed by the same scan less than a tenth.
  - A counter's thousand increments, each read again, take about 40% less time.
  - With a row reading each task, as in a list, a write to one task followed by
    that row reading it again takes about a sixth less time, and the write alone
    about 40% less. With 10,000 tasks and rows the two take about as long, and the
    write alone about a tenth longer.
  - In a store that needs the patch pair -- `enablePatches`, a transport or a
    commit listener -- a write to one element of 10,000 takes about a fifth of
    the time.

  A tracked read is recorded against the reactive path node its state proxy
  already holds, deduplicated with a collection stamp, and linked once per
  dependency when the collection ends, instead of building a path array and
  walking the dependency trie on every read. A tracker from
  `createReactiveTracker()` keeps its signal links until it tracks again, and
  reuses them. A local write that needs no patch pair compares the paths its
  readers observed, descending only into what changed identity, for read sets of
  any size: below an array whose elements are mostly read through nodes of their
  own, it compares the two arrays element by element and looks up the node of
  only an element that changed. A write that only sets values on the root's own
  keys copies the root instead of creating a Mutative draft, and keeps the root's
  shape without checking it again. A store that needs the patch pair no longer
  compares every element of each array along a written path when its recipe read
  nothing beside that path.

- 441657a: Read through an object that was frozen before a recipe assigned it to the
  state, such as a constant passed through `Object.freeze()` or data another
  library froze. Its readonly view returned proxies for the object's properties,
  which JavaScript forbids for the read-only, non-configurable properties of a
  frozen object, so reading one that held an object -- `state.config.theme` --
  threw a `TypeError` saying the proxy "did not return its actual value". The
  view now returns the object the property holds, frozen as the other values a
  store hands out are, and a write through the view still throws.
- 3c9a3d9: Depend on an inherited property that a tracked read returns, so a write that
  shadows it with an own property notifies the reader.
- 441657a: Create stores faster and keep less of their data. Measured in Node 24 against
  4.1.0, creating a store of 1,000 tasks takes about a third less time, and,
  with `getInitialState()` reading the store's own root, the store keeps about
  70 KB -- 28% -- less heap.

  The initial state is copied into the store with object literals laid out like
  their source, dense arrays are copied by index, and the memo of a copy lives
  only as long as the copy. Its values are no longer frozen as they are copied:
  the copy lists them, children before what holds them, and the store freezes the
  whole list in one pass when it first hands one out, so a store read only as
  plain data -- `getPureState()`, or whole selectors in `@coaction/react` --
  freezes nothing. After a write, the elements of the array a scan receives are
  frozen by index, skipping those already frozen. `sanitizeInitialStateValue` and
  `sanitizeReplacementState` still accept a `WeakMap` memo.

- e504f9c: Require Mutative 2.0.2, as `@coaction/history` now does too. Under Mutative
  2.0.0, deleting an index past the end of an array in a recipe --
  `delete state.list[10]` on a shorter list -- lengthened the array through that
  index with `undefined` elements, which notified the readers of its length and,
  in a store with a commit listener, published a commit. Such a delete now leaves
  the state as it was, as it does in JavaScript.
- 4408581: Hand the deprecated `store.patch` hook copies of the patch pair. Patch values
  are objects of the states on either side of a transition: after a recipe moves
  an element, as `reverse()` or `splice()` does, an inverse value is an element
  the next state still holds. A hook that edited a value in place therefore
  rewrote the committed state, and the previous one, without a notification.
  Edits a hook makes to the patches it returns still apply.
- 034b72c: Reset a store with `store.setState(store.getInitialState())`. The object
  `getInitialState()` returns holds the factory's methods, accessors and computed
  values beside its data, and `setState()` rejected them as keys the state does
  not have, so a store with any method threw `StateSchemaError` instead of
  resetting -- in 4.1 as well. Given that object, directly or returned from a
  recipe, `setState()` now takes its data alone. Any other value is checked as
  before.
- c949739: Keep every dependency of a tracker from `createReactiveTracker()` in
  `coaction/adapter` that tracks again in another read order. alien-signals
  skips relinking a signal whose last link already carries the current cycle,
  and a tracker tracks outside alien-signals' own runs, so a second `track()`
  with no signal written since the first dropped a dependency it read earlier
  than before, and stopped hearing about it. The React bindings now track each
  component's tracker again on every render, and rely on this.
- b485adf: Keep a reactive tracker's dependencies when its callback calls `track()` on it
  again, directly or through another tracker: the reads of the outer evaluation
  were lost, so a change to them no longer notified. A tracker disposed from inside
  its own callback now leaves no dependency behind, and no longer leaves its
  collection active for the trackers that run after it.

## 4.1.0

### Minor Changes

- 1368927: Coaction depends on Mutative 2.0, and `@coaction/history` on Travels 3.0.1,
  which requires Mutative 2. No Coaction API changed.

  Commits carry the patches Mutative 2 produces. The patches of a nested value
  come before those of its parents, and a draft that a recipe moves is carried by
  the patches of its parent instead of patches under the path it left. They
  replay to the same state, and inverse patches undo them in order; tests that
  compare patch arrays may need new expectations. A recipe that drafts a nested
  value, moves it within its array and then writes into it now commits Mutative's
  element patches instead of replacing the changed top-level keys.

  Production builds of Mutative throw `Minified Mutative error #<code>` instead of
  the message, also for patches that `@coaction/sync` cannot apply. Mutative
  selects its build from `process.env.NODE_ENV`, so define it in every bundle.

  npm stops with `ERESOLVE` when an application installs `@coaction/history` next
  to a library that declares Mutative 1 as its peer, such as `zustand-mutative` 1
  or `travels` 2. Upgrade those libraries to versions that accept Mutative 2.

  `@coaction/mobx`, `@coaction/pinia` and `@coaction/valtio` no longer install
  `mutability`, which they stopped using when patches began to apply through
  mutable snapshots, and which declares Mutative 1 as its peer.

  See `docs/migration/mutative-2.md`.

## 4.0.0

### Major Changes

- A transition the runtime cannot express as a patch pair is now described more
  coarsely rather than refused. mutative records patch paths positionally, so a
  recipe that drafts a nested value, moves it within its parent array and then
  writes into it records the position the value used to have — and Coaction
  makes a transition by applying that pair, so the `set()` failed. Only on a
  store that was being watched: with no listener, no validator and no observer,
  no pair is produced and the same recipe worked. Attaching `@coaction/history`,
  or rendering one component with `observer`, made previously valid code start
  throwing. Such a transition is now described as the difference between the
  state before and the state the recipe produced, one patch per changed
  top-level key.

- `store.apply` belongs to Coaction on every store, and an external adapter now
  says only how to write into its own runtime.

  An adapter used to replace `store.apply` outright. That handed it commit
  semantics it did not want: none of them published a commit, so `store.apply()`
  on a MobX, Valtio or Pinia store changed the state and told nobody —
  `@coaction/history` had nothing to undo and `@coaction/sync` never queued it.
  Putting the commit pipeline back around whatever an adapter installed then
  produced three separate ways to publish the same transition twice, each found
  and fixed in turn. And because middleware runs before the binder, replacing
  `apply` silently discarded anything middleware had wrapped it with.

  An adapter now sets `internal.externalApply` — how to get a change onto its
  runtime, and nothing else. Coaction works out the patch pair before the change,
  runs commit validators, calls the writer, and publishes the commit, in one place
  for every adapter. Middleware that wraps `store.apply` keeps working on stores
  built through a binder.

  **If you maintain a third-party adapter**, replace `store.apply = writer` with
  `internal.externalApply = writer`. The signature is unchanged. Do not publish a
  commit from it; Coaction does that.

  `store.apply(state, patches)` also now requires `state` to be the state the
  store holds — omit it, or pass `getPureState()`. A patch pair describes a change
  to the current state, so applying it to anything else left the store somewhere
  its own commits did not lead.

- fa03a28: `coaction` is now the local runtime, and `coaction/local` is gone. Shared and
  client stores import `create` from `coaction/shared`.

  The default import decided what a bundle carried, and it decided wrong for
  almost everyone: `coaction` reached the transport runtime, so `data-transport`
  — 27 KB minified — landed in every application that wrote
  `import { create } from 'coaction'`, whether or not a Worker was ever involved.
  A React application measured 30.1 KB gzip that way and 18.2 KB through
  `coaction/local`: the same program, 40% smaller, chosen by a line the docs
  barely mentioned.

  `coaction/shared` is unchanged — it was already the full build, byte for byte
  identical to the root entry — so code that creates shared stores changes one
  import and nothing else. `coaction/local` becomes `coaction`.

  `@coaction/react/local` is removed for the same reason: it was an explicit alias
  of a default that is now unambiguously the local runtime.
  `@coaction/react/shared` is unchanged.

  Passing `worker`, `transport`, `clientTransport`, `transportPolicy` or `share`
  to the default entry throws with the entry to switch to. See
  `docs/migration/default-entry-is-local.md`.

### Minor Changes

- e58179a: Track reactivity per state path, to any depth.

  Dependencies used to stop at the top-level property: everything reached through
  `state.user` shared one slot, so writing `user.profile.age` woke every consumer
  that had read anything under `user`. Reading `state.user.profile.name` now
  records a dependency on that leaf, and an unrelated sibling update no longer
  re-runs the selector. Flat state shapes are unaffected -- they were already
  tracked at this granularity. Dependency nodes are reference-counted and
  reclaimed, and a store with no reactive consumer keeps taking the patch-free
  write path.

  The trade is a slower property read through the public state, since every access
  goes through the tracking proxy. Reads outside a tracked scope — action bodies,
  event handlers, a bare `getState()` — skip that work entirely and stay at the
  cost of a plain proxy.

  `whole()` is the escape hatch for the case where per-element precision is
  wasted: a selector that scans a collection. It records one dependency on the
  value and returns the plain object, so the scan runs at plain-object speed and
  still re-runs whenever anything inside changes. Scanning a 2000-element array in
  a tracked selector goes from 0.62 ms to 0.013 ms.

  Also in this release:

  - `@coaction/react` gains a `@coaction/react/shared` entry point, so an app that
    never uses a worker no longer bundles the transport runtime. A tracked component now releases its path nodes as soon as
    React unmounts it, instead of holding them for the uncommitted-render window.
  - `@coaction/sync` is new: commit-based local-first synchronization with a
    durable optimistic snapshot and outbox, pre-hydration journaling, conflict
    policies, path-local rebase inverses, status subscriptions, retry with
    backoff, and a fetch adapter. A pending mutation that a remote change has made
    impossible to replay — its parent was deleted, say — is dropped and reported
    through `onError` rather than retried forever. A remote that acknowledges only
    part of a push hands the rest to the backoff timer instead of reporting idle
    with work still undelivered, and a storage read that throws is reported
    through `onError` without also escaping as an unhandled rejection.

- e58179a: `@coaction/react` now links the local runtime. Worker and cross-context stores
  move to `@coaction/react/shared`.

  The default entry used to carry the transport protocol whether or not a worker
  was ever created — about 12 KB gzip in a minimal app, paid by every application
  that imported React state. A minimal app goes from 31.9 KB to 19.9 KB gzip.

  Only code passing `worker`, `transport`, `clientTransport`, `transportPolicy`,
  `workerType` or `executeSyncTimeoutMs` to `create` from `@coaction/react` has to
  change, and the change is the import:

  ```diff
  - import { create } from '@coaction/react';
  + import { create } from '@coaction/react/shared';
  ```

  Both sides of a shared store — the worker module and the page — take the same
  entry. TypeScript reports the mistake at the call site, and the runtime error
  names the entry to switch to. See `docs/migration/react-entry-points.md`.

  An option whose value is `undefined` or `null` is no longer treated as a request
  for the shared runtime. `{ worker: maybeWorker }` where the worker is absent —
  feature detection, an SSR guard — degrades to a local store on any entry, which
  is what that code wants. Note that a store created from the shared entry keeps
  async actions in that fallback, because they may cross a worker boundary; the
  local entry's are synchronous.

### Patch Changes

- d393227: `store.apply(state, patches)` now refuses a `state` that is not the one the
  store holds.

  A patch pair describes a change to the current state — that is what the pair
  means and what the commit built from it says. Applying it to something else
  leaves the store somewhere its own commits do not lead: `apply({ a: 10, b: 0 },
[b → 1])` on `{ a: 0, b: 0 }` produces `{ a: 10, b: 1 }` while the commit replays
  to `{ a: 0, b: 1 }`, and nothing reading commits can tell.

  `Store.apply` was always documented as applying patches to the current state, so
  the supported forms are unchanged: omit `state`, or pass `getPureState()`.

- 8dfbe1b: Reading a computed getter after a write is an order of magnitude faster again.

  A getter reads state through a frozen snapshot of the subtree it touches, cached
  by object identity, and a write makes the containers along the change new
  objects. Carrying the snapshot forward along the patch paths is proportional to
  the change; rebuilding it is proportional to whatever the getter can reach.

  The maintenance existed, in the `setState` fast path — which a store with
  reactive path nodes cannot take, and reading a getter is what creates those
  nodes. So it stopped running the moment the feature it serves was used, and
  nothing reported it: every value stayed correct and the cost went up. It now
  runs at the commit point, which every write passes.

  On a store of a thousand items, a getter summing them goes from 3,837 reads a
  second to 41,972; one reading a single field of four thousand items goes from
  1,043 to 34,413, and no longer gets slower as the array grows.

- ccea3c9: A commit's inverse patches are now rebuilt in one more case: where a later patch
  writes inside what an earlier one replaced, not only where it replaces what an
  earlier one wrote inside.

  Both directions make the pair unsafe to apply in the order it comes — undoing a
  container before the write inside it re-applies into something already whole,
  which for an `add` is one element too many. Only the first direction was
  detected, so a transition of the second shape produced an inverse that could not
  be applied: an undo that fails, or a sync rebase that stops rolling back.

  Found by running the property suites at fifty times their usual seed count.

- 3be75d1: A third review pass, mostly about what happens at a crash boundary and at the
  seams between the core and its adapters.

  **CRUD handlers now receive the mutation a write carries.** The outbox gives each
  mutation a stable id so a remote that dedupes on it makes a retry after a crash
  safe; the handlers took only a record, so no CRUD-based adapter could honour the
  contract the README described. `create`, `update` and `delete` take a second
  argument with the operation, the record, the queued mutation ids, and a stable
  `idempotencyKey`.

  **Supabase creates survive their own replay.** `insert()` met its own row after a
  crash between the remote committing and the acknowledgement persisting, and
  failed forever on a unique constraint. It is now an upsert on the id column.

  **The adapter's view of the remote advances only when the store takes a result.**
  A new `SyncAdapter.accept(result)` runs after the rebase and before the
  checkpoint, so a pull discarded as stale, or a subscription arriving mid
  hydration, no longer leaves the adapter describing a remote the store never
  accepted.

  **Firestore realtime updates the baseline**, which it did not while Supabase's
  did — a document learned about only through `onSnapshot` could be deleted
  locally with no `deleteDoc` ever sent. A removal from a narrowed read does not
  count, since leaving a query is not leaving the collection.

  **Supabase `schema` applies to reads and writes**, not just the realtime filter,
  which previously watched one table while reading and writing another. A
  non-default schema now requires a client exposing `schema()`.

  **Supabase pulls page by key rather than by offset**, so a row deleted mid-pull
  no longer pushes the row behind it out of an authoritative snapshot, and the
  record ceiling is checked before the loop ends rather than after.

  **`sync()` refuses a runtime with nowhere durable to write.** `localStorage` was
  checked on every call and silently skipped when absent, so a Worker — the
  environment this library exists to support — ran with a memory-only outbox while
  calling it durable. Pass `storage: false` to choose that deliberately.

  **`@coaction/react` compares carried state values by identity as well as
  version.** A version is a sum of path versions, so two untouched siblings share
  one: a reused wrapper swapping between them compared equal and skipped the
  render.

  **A remote fact counts when it arrives, not when it finishes applying.** A
  successful push that answered without patches never advanced the staleness
  guard, so a pull already in flight was judged current on return and rolled back
  a write the remote had committed and the outbox had acknowledged — and `{}` is
  what every built-in CRUD adapter returns from `push`. The check was also a
  check-then-act, so a subscription that had arrived and was still queued left it
  unchanged too. The epoch now moves on arrival, the check runs inside the apply
  lane, and every push result goes through that lane whether or not it carries
  patches.

  **CRUD writes return what the backend made of them.** A `create` or `update`
  that answers with the stored record now produces patches, so the store stops
  disagreeing with the row it just wrote until some later pull corrects it.

  **Delivery semantics are written down.** Mutations are at-least-once, and the
  built-in Supabase and Firestore adapters are last-write-wins under replay —
  retry-safe, which is not the same as idempotent. The README shows the replay
  that surprises people and what a handler built on `idempotencyKey` looks like
  instead.

  **A Supabase full pull can decline to be authoritative.** Keyset paging removed
  offset drift; it does not make several requests one snapshot, so
  `authoritativeList` is now an option rather than a derived value.

  **A mutation's idempotency key no longer changes when it is reclassified.** The
  key included the operation, which is decided against the adapter's baseline at
  send time — so a create whose answer was lost, retried after realtime reported
  the row it made, went out as an update under a different key. A ledger keyed on
  the first one would apply the write twice, which is the failure the key exists
  to prevent.

  **Authoritative deletions come from the durable baseline, not the current
  store.** With `persistState: false` a restarted store is empty, so a record the
  remote had dropped produced no removal and the baseline kept claiming it; and a
  record created locally but never sent produced a removal for something the
  remote never had, which only the default conflict policy was undoing.

  **State has to be JSON, and saying so beats rewriting it.** Everything persisted
  goes through `JSON.stringify`, while Coaction's local core does not require
  JSON — so a `Date` came back a string, a `Map` came back `{}`, and nothing said
  so until something downstream read the wrong type. `sync()` now refuses such
  state with the path to the value, checks each commit's patches, and encodes
  inside the queued write so a `BigInt` or a cycle fails the write instead of
  throwing back out of the `set()` that already committed.

  **A push answer overtaken by something newer is not applied.** Arrival order is
  not commit order: an answer describing what the server made of an earlier write
  would put that value back over an edit that has since arrived. The
  acknowledgement stands; the state it describes is left to a pull.

## 3.2.1

### Patch Changes

- 2aa64be: Fix an O(total state) cost in the object-payload `setState()` path. Copying the store's current
  root state ran every value through the deep replacement sanitizer, so `set({ ... })` re-cloned
  untouched fields on every commit. Replacing a single scalar in a store holding a 10,000-item array
  drops from ~1,591 ms to ~2 ms per 400 operations. Incoming payloads are still deep-sanitized, so
  the aliasing and unsafe-key guarantees are unchanged. Both the fixed path and the payload path are
  now covered by benchmark regression thresholds. The `coaction/local` gzip budget moves up ~240 B to cover the new helper.

## 3.2.0

### Minor Changes

- 0a394fd: Add an explicit, contract-safe local fallback for client stores. Passing `worker: undefined` or `clientTransport: undefined` now keeps `getState()` actions promise-based, defers their effects until the promise job runs, and enforces the shared JSON contract for state, arguments, and results. Client option overloads now preserve that async type through object spreads, while `getInitialState()` accurately retains the original synchronous initialization shape.

  Migration: callers that previously passed `worker: undefined` or `clientTransport: undefined` must now `await` actions. Initial state, action arguments and results, and low-level state mutations on that path must remain JSON-compatible.

## 3.1.0

### Minor Changes

- Added `onStoreCommit()`, `onStoreCommitPrepare()`, and
  `replayStorePatches()` to `coaction/adapter`. External runtimes can now observe
  authoritative patch pairs and replay navigation through Coaction's validation,
  middleware, adapter, subscription, and transport pipeline.
- Published commit events for direct root replacements and added
  middleware-scoped patch replay so integrations can preserve their own
  `setState` boundary.

### Patch Changes

- Shared store-readiness metadata across the root, local, shared, and adapter
  entry bundles so mixed imports cannot miss ready callbacks.
- Preserved circular, shared, and other non-tree local object graphs when
  publishing replacement commits.
- Skipped commit-prepare work for scalar transitions while retaining exact
  replacement preparation for object graphs.

## 3.0.0

### Major Changes

- 9a43c82: Adopt a JSON-only shared-store contract and versioned string wire protocol.
  Shared state, action arguments/results, patches, and snapshots now reject
  non-JSON or lossy JavaScript values before transport. Client mirrors use
  authority epochs and contiguous sequences to recover reconnects and update
  gaps, while remote execution is limited to declared action paths and optional
  transport policy.

  Add static `coaction/local`, `coaction/shared`, and `coaction/adapter` entry
  points. Adapter-authoring helpers move from the root export to
  `coaction/adapter`; official adapters now expose plain JSON transport snapshots
  without linking adapter internals into the core runtime.

  Preserve deep public-state mutation guards while evaluating cached derived
  values against an incrementally updated frozen snapshot. This removes the
  per-field readonly-proxy cost from invalidated computed reads and restores the
  maintained update-plus-read performance gate.

  Commit native shared-store updates through a private prepared-patch path so
  already checked patches and final state are not repeatedly cloned, sanitized,
  and scanned. Public `apply()`, custom updaters, patch hooks, middleware, and
  adapter overrides retain their full validation boundaries.

  Redact unexpected remote action failures by default instead of forwarding an
  arbitrary thrown `Error.message` across the transport boundary. Authorities
  can explicitly publish application-safe domain messages through
  `transportPolicy.mapError`.

  Reject in-flight action responses from a superseded authority with
  `ActionAuthorityChangedError` instead of attempting a full sync back to the
  old epoch. The error exposes a stable code and marks the action outcome as
  unknown so callers do not blindly retry non-idempotent work. The public error
  and stale-response guard add about 0.3 KiB gzip to the shared entry.

## 2.1.0

### Minor Changes

- Hardened fixed-schema runtime invariants by locking public state modules, rejecting destroyed-store operations, and keeping replacement-style known root key omission explicit.
- Added shared root replacement and mutable adapter helper flows so history, persistence, Yjs, and official mutable adapters apply root add/remove/replace semantics consistently.

### Patch Changes

- Rejected unsafe patch-hook output before applying patches instead of silently dropping unsafe paths.
- Prevented patch application from public state facades from resurrecting omitted known root keys.
- Documented the supported integration helper surface and external mutable-runtime unknown-key policy.

## 2.0.0

### Major Changes

- Rebuilt computed state on top of `alien-signals`, including cached getters, dependency-aware invalidation, exported signal primitives, and reactive tracking utilities for framework bindings.
- Added the formal external store adapter API through `defineExternalStoreAdapter()` and the compatibility `createBinder()` alias, with lifecycle-ready hooks and helper utilities for exact external-store replacement.
- Tightened shared-store semantics for 2.0 by requiring JSON-serializable shared state, rejecting symbol/unsafe execute paths, validating `fullSync` payloads, and preventing client mirrors from mutating through `apply()` or adapter bypasses.
- Expanded state-shape support for local stores, including symbol-keyed slices, symbol-keyed actions, circular references, sparse arrays, non-enumerable raw descriptors, and object single-store creators.

### Patch Changes

- Hardened patch handling by sanitizing custom updater patches, patch-hook output, low-level `apply()` state, client `fullSync` state, and nested enumerable merges.
- Preserved cycles, sparse arrays, and hidden descriptors while copying, initializing, replacing, and reading state.
- Improved async client behavior by awaiting async method return types, validating sequence catch-up/full-sync fallbacks, and guarding SharedWorker client detection.
- Ensured middleware can observe external store updates consistently while keeping adapter markers hidden unless they must remain copyable for keyed adapters.

## 1.5.0

### Minor Changes

- Hardened state update semantics by filtering unsafe keys during initialization and fast-path updates, preserving symbol-keyed state descriptors, treating `setState(null)` as a no-op, removing duplicate patch notifications, and preserving slice sibling state in the local object fast path.
- Tightened shared-client synchronization by rejecting stale `fullSync` fallbacks before they can roll back mirrored state.
- Tightened `create()` mode validation and documented the maintained runtime, adapter, and middleware support boundaries for the 1.5 line.

## 1.4.1

### Patch Changes

- Clarified the guidance for ambiguous `sliceMode: 'auto'` object-of-functions inputs with explicit `single` and `slices` examples in warnings and docs.
- Documented and tested that methods destructured from `store.getState()` keep their `this` binding to the latest store state.
- Added a generated core API reference for `create()`, store types, middleware contracts, and `createBinder()`.

## 1.4.0

- Added `executeSyncTimeoutMs` to configure how long async clients wait for sequence catch-up before falling back to `fullSync`.
- Preserved 1.x middleware and worker typing compatibility by keeping `patch`, `trace`, and deprecated `workerType` options public while introducing `MiddlewareStore` as the preferred middleware-facing type.
- Kept `sliceMode: 'auto'` backward-compatible for object-of-functions inputs, but now warns in development because that shape is ambiguous and should use an explicit `sliceMode`.

## 1.3.0

- Recovered client synchronization after sequence resets and incremental apply failures.
- Blocked prototype pollution in `mergeObject`.

## 1.2.0

- Hardened full-sync fallback handling by validating payload shapes, rejecting stale sequences, preventing sequence rollback, and guarding update-listener failures.
- Improved state initialization and slice merging by validating factory return values, ignoring unknown or inherited keys, and supporting legacy execute transport responses.
- Awaited async worker execute results, enforced shared store name uniqueness, and emitted patches after patch-hook transformation.

## 1.1.0

- Added a full-sync timeout fallback for execute sequences.

## 1.0.1

- First 1.x version-alignment release with no package-specific source changes.

## 0.2.0

- Added explicit `sliceMode` and fail-fast validation for third-party slices bindings.
- Hardened store lifecycle and middleware validation, including destroy safety, init-failure cleanup, and unknown-safe transport error handling.
- Improved async, client, and worker transport handling while migrating the workspace build from Preconstruct to `tsup`.

## 0.1.5

- Refined `act()` and raw-state internals ahead of the first adapter expansion.

## 0.1.4

- Version-alignment release with no package-specific source changes.

## 0.1.3

- Version-alignment release with no package-specific source changes.

## 0.1.2

- Version-alignment release with no package-specific source changes.

## 0.1.0

- Initial release of the Coaction core store API.
- Added computed state, patch support, slices, async actions, and client/worker/shared-worker synchronization.
- Added middleware support and early examples for framework adapters.

## Unreleased

- Add lazy patch-driven deep reactive path tracking for immutable stores.
- Remove full signal-slot refresh scanning from immutable commit paths.
