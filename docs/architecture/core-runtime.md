---
type: architecture
title: Core runtime lifecycle
description: Store creation, readiness, authority, state materialization, and patch-commit boundaries in the Coaction core.
owner: unadlib
status: accepted
risk_level: critical
tags: [core, lifecycle, state, patches]
---

# Core Runtime

This document describes how a Coaction store is created, initialized, and mutated inside `packages/core`.

## Creation Lifecycle

`create()` has three runtime outcomes:

- local store
- main/shared store
- client/shared mirror

The creation path is the same until transport handling splits:

1. Infer store mode from `transport`, `clientTransport`, `worker`, and `workerType`
2. Allocate the store shell and internal runtime state
3. Install base store methods: `setState()`, `getState()`, `subscribe()`, `destroy()`, `apply()`, `getPureState()`
4. Infer `isSliceStore` from `sliceMode`
5. Apply middlewares in order
6. Materialize the initial state through `getInitialState()`
7. Materialize the raw state and bound methods through `getRawState()`
8. If needed, attach the main/client transport and register its listeners
9. Mark the store ready, run readiness callbacks, and confirm that callbacks did
   not destroy the store
10. Wrap the initialized store for callable usage

The important detail is step 5: middlewares run before the initial state is finalized. A middleware may therefore influence initialization behavior by wrapping store methods such as `setState()`, `apply()`, or `destroy()`.

`onStoreReady()` is the integration boundary for work that requires a finalized
store. Local callbacks run after state materialization. Shared-main and client
callbacks run only after the transport and its listeners are installed. If
initialization or a readiness callback throws or destroys the store, creation
MUST fail and installed listeners and transports MUST be released before the
caller can observe a returned store.

## Store Categories and Authority

Coaction has three store authority categories:

- Local store
  - `store.share === false`
  - mutation authority is local
  - no transport is attached
- Main store
  - `store.share === 'main'`
  - mutation authority is local to the main runtime
  - outgoing updates are emitted over `store.transport`
- Client store
  - `store.share === 'client'`
  - mutation authority lives elsewhere
  - direct `setState()` is rejected
  - store methods become transport-backed async calls

The authority model is strict:

- only local/main stores may execute `setState()`
- client stores may only request execution through a bound store method
- all shared state convergence is driven by the main store sequence counter

## State Materialization

`getInitialState()` is responsible for turning `createState` into an object shape that the runtime can consume.

It supports:

- a single Coaction state factory
- a pre-built object
- a third-party store exposing `getState()`
- a function-returning-store form used by some adapters
- binder-backed state objects tagged by `defineExternalStoreAdapter()` or `createBinder()`

For slice stores, this work happens per slice key.

`getRawState()` then derives two parallel representations:

- `internal.rootState`
  - raw serializable state without method descriptors
- `internal.module`
  - user-facing state object with methods/getters rebound to the latest state

This separation is what allows Coaction to serialize state while keeping method binding and getter behavior stable.

The public state schema is fixed after this materialization step. For a single store, later mutations may not introduce new top-level state keys. Replacement-style paths such as `apply()` may omit a known single-store root key; that key remains part of the public module and reads as `undefined`, while the raw state no longer owns the key. For a slices store, later mutations may not introduce new slice keys or new top-level fields inside an existing slice, and slice root keys cannot be removed or replaced with non-object values. Dynamic data should live under a known object or array field so the public module and raw state cannot diverge.

## Patch and Finalize Flow

There are two mutation paths.

### 1. Plain local mutation without patches

This is the fast path for local stores when patches are not enabled and the runtime does not need mutable-instance integration.

Flow:

1. `setState()` mutates or shallow-merges a new root snapshot
2. listeners are notified directly
3. no patch sequence is emitted

### 2. Patch-producing mutation

This path is used when:

- the store is shared
- `enablePatches` is enabled
- an integration requires patch handling

Flow:

1. `setState()` enters batching mode
2. Mutative produces `patches` and `inversePatches`
3. optional middleware compatibility hook `store.patch()` can transform them
4. `store.apply()` commits the final patches to `internal.rootState`
5. immutable listeners are notified
6. shared stores emit the patch sequence over the transport

Patch paths are validated before they are applied. Runtime mutation paths reject `__proto__`, `prototype`, and `constructor` path segments with `UnsafePatchPathError`; `store.patch()` output is treated the same way, so middleware cannot accidentally produce a partial commit where safe patches apply and unsafe patches are silently dropped.

Mutable-instance integrations add one extra phase. Actions may execute against a draft, and the runtime later calls `finalizeDraft()` to obtain the patch pair. That finalized patch pair still goes through the same `store.patch()` and `store.apply()` pipeline before it is emitted.

Root replacement flows used by history, persist, Yjs, and shared hydration use `createRootReplacementPatches()` and `applyRootReplacementWithPatches()` so root-level add/remove/replace semantics stay consistent across middleware. Mutable adapters use the exported adapter helpers to apply patches through snapshots before syncing Coaction raw state, public state, and the external mutable runtime.

## Method Binding Rules

Methods exposed through `getState()` or slice state always execute against the latest user-facing state object. This is why patterns such as destructuring a method and then calling it later continue to work even when the method relies on `this`.

## Middleware Order

Middlewares are reduced left-to-right:

1. the base store shell is created
2. `middlewares[0]` receives that store
3. `middlewares[1]` receives the previous middleware result
4. the final store-like object is copied back onto the base store shell
5. state initialization runs against the middleware-enhanced store

Implications:

- initialization-time `setState()` or `destroy()` behavior can be affected by a middleware
- middlewares must preserve the full store contract
- replacing the store object is supported, but the returned object must still be store-like

## Supported and Unsupported Runtime Combinations

Officially supported runtime combinations at the core layer:

- local single store
- local slices store
- main/shared single store
- main/shared slices store
- client/shared single store
- client/shared slices store

Officially unsupported combinations at the core layer:

- direct `setState()` in client mode
- binder-backed state inside slices mode
- shared mode with patch generation explicitly disabled

Those boundaries are enforced partly by runtime checks and partly by adapter or middleware-specific contracts.

## Verification

- Creation, readiness, failure cleanup, and re-entrant destroy behavior:
  `packages/core/test/index.test.ts`.
- Patch validation and commit atomicity: `packages/core/test/branch.test.ts` and
  `packages/core/test/transportProtocol.test.ts`.
- Full core behavior: `pnpm --filter coaction test`.
- Package entry isolation and budgets: `pnpm package:size`.
