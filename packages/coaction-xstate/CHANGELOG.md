# @coaction/xstate

## 2.0.0

### Major Changes

- Updated the XState adapter for Coaction 2.0's formal external store adapter
  contract.
- Made XState actor context the authoritative mutation path by blocking direct
  Coaction mutations and middleware bypasses.

### Patch Changes

- Subscribed to the actor after Coaction store initialization.
- Ignored client actor writes and rejected unsupported client-side mutations.
- Sanitized unsafe initial context keys and exact snapshot replacements.
- Made adapter destroy handling idempotent.
- Updated dependencies
  - coaction@2.0.0

## 1.5.0

### Minor Changes

- Added official binder-adapter contract and type coverage for local whole-store
  XState integrations.
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

- First stable release of the XState adapter.
