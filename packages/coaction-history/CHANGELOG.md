# @coaction/history

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
