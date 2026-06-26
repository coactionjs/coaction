# @coaction/redux

## 2.0.0

### Major Changes

- Updated the Redux adapter for Coaction 2.0's formal external store adapter contract.
- Reworked replacement dispatch handling so Redux state and Coaction state stay synchronized during Coaction-initiated and Redux-initiated replacements.

### Patch Changes

- Notified Coaction subscribers after replacement dispatches initiated by Coaction.
- Preserved circular replace payloads, symbol keys, array properties, and non-record snapshot values where Redux state allows them.
- Sanitized unsafe replacement keys and avoided leaking binder symbol markers into Redux state.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Notified Coaction subscribers after external Redux writes and added official binder-adapter contract coverage for local whole-store usage.
- Aligned the peer dependency with `coaction@^1.5.0`.

## 1.4.1

### Patch Changes

- Aligned the peer dependency with `coaction@^1.4.1`.

## 1.4.0

- Aligned the peer dependency with `coaction@^1.4.0`.

## 1.3.0

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Unsubscribed the Redux listener when the Coaction store is destroyed.
- Sanitized replace-action payloads by stripping inherited properties only.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Redux adapter.
