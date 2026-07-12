# @coaction/history

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

  Read the [Coaction 3.0 migration guide](https://github.com/coactionjs/coaction/blob/v3.0.0/docs/features/json-only-shared-runtime/migration.md)
  before upgrading any Worker, SharedWorker, injected-transport, or custom-adapter
  deployment.

### Patch Changes

- Updated dependencies [9a43c82]
  - coaction@3.0.0

## 2.1.0

### Patch Changes

- Routed local undo/redo root replacements through the shared patch pipeline so middleware patch transforms, root key removals, and logger before/after state stay consistent.
- Validated the history `limit` option as a non-negative integer.
- Updated dependencies
  - coaction@2.1.0

## 2.0.0

### Major Changes

- Updated the history middleware for Coaction 2.0's stricter middleware and shared-store contracts.
- Hardened history snapshots so undo/redo can safely preserve sparse arrays, symbol keys, cyclic graphs, non-record values, and nested partial siblings.

### Patch Changes

- Rejected usage on client mirror stores, where local undo/redo would diverge from the authoritative main store.
- Ignored unsafe snapshot keys and cloned exposed snapshots to avoid accidental mutation or prototype-pollution paths.
- Suppressed initial persistence and Yjs hydration from the undo/redo stack so restored remote state does not appear as a user action.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Fixed undo/redo snapshot application so deletions are preserved.
- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Improved undo/redo snapshot handling for arrays, cyclic data, and inherited properties.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the undo/redo history middleware.
