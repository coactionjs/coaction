# @coaction/jotai

## 2.0.0

### Major Changes

- Updated the Jotai adapter for Coaction 2.0's formal external store adapter contract.
- Hardened atom synchronization across local and shared stores so Coaction and Jotai subscribers observe the same state transitions.

### Patch Changes

- Notified Coaction subscribers after atom syncs initiated from Coaction.
- Preserved safe property keys during atom-state copying while continuing to filter unsafe keys.
- Guarded shared client atom writes and restored client mirrors after rejected external writes.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Notified Coaction subscribers after external Jotai atom writes so framework bindings and middleware stay in sync with adapter-backed updates.
- Added official binder-adapter contract coverage for local whole-store Jotai integrations.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Jotai adapter.
