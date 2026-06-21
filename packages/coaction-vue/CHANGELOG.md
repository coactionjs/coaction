# @coaction/vue

## 2.0.0

### Major Changes

- Updated the Vue binding for Coaction 2.0's signal-backed core and creator
  typing model.
- Reworked auto-selectors so nested plain objects can be traversed while keeping
  action references stable through the Vue state proxy.

### Patch Changes

- Kept state-proxy actions stable across state reads.
- Treated non-plain objects and arrays as auto-selector leaves.
- Included symbol keys and ignored non-enumerable keys when generating
  auto-selectors.
- Updated creator typings for object single-store creators and symbol-keyed
  slices inherited from the core.
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

- Aligned the peer dependency with `coaction@^1.3.0`.

## 1.2.0

- Fixed `autoSelector` generation to ignore inherited keys.
- Aligned the peer dependency with `coaction@^1.2.0`.

## 1.1.0

- Aligned the peer dependency with `coaction@^1.1.0`.

## 1.0.1

- Aligned the peer dependency with `coaction@^1.0.1`.

## 1.0.0

- First stable release of the Vue adapter.
