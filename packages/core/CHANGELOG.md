# coaction

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

  Read the [Coaction 3.0 migration guide](https://github.com/coactionjs/coaction/blob/v3.0.0/docs/features/json-only-shared-runtime/migration.md)
  before upgrading any Worker, SharedWorker, injected-transport, or custom-adapter
  deployment.

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
