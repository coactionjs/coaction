# coaction

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/coaction.svg)](https://www.npmjs.com/package/coaction) ![license](https://img.shields.io/npm/l/coaction)

An efficient and flexible state management library for building high-performance, multithreading web applications.

Coaction uses `alien-signals` internally for cached getter/computed state, React selector reactivity, and adapter-facing subscriptions. The core package also re-exports the signal primitives for advanced integrations.

## Installation

Install it with pnpm:

```sh
pnpm add coaction
```

## Usage

```jsx
import { create } from 'coaction';

const store = create((set) => ({
  count: 0,
  get doubleCount() {
    return this.count * 2;
  },
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));
```

Core stores are immutable by default. Getters and methods can read through `this`, but writes to Coaction-owned state must happen inside `set()` or `set((draft) => ...)`. Direct writes such as `this.count += 1` in a store method throw because they bypass the commit path that notifies subscribers, produces patches when enabled, and synchronizes worker/client mirrors in shared mode.

Accessor getters are cached automatically through the built-in signal runtime. Use `get(deps, selector)` when you want to declare dependencies manually:

```ts
const store = create((set, get) => ({
  count: 0,
  doubleCount: get(
    (state) => [state.count],
    (count) => count * 2
  ),
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));
```

Advanced integrations can import the native signal primitives and adapter helper directly from `coaction`:

```ts
import { computed, defineExternalStoreAdapter, effect, signal } from 'coaction';
```

Store methods using `this` are rebound to the latest state when invoked from `getState()`, so destructuring remains safe:

```ts
const store = create((set) => ({
  count: 0,
  increment() {
    set(() => {
      this.count += 1;
    });
  }
}));

const { increment } = store.getState();
increment();
```

## API Reference

- [Generated core API index](https://github.com/coactionjs/coaction/blob/main/docs/api/core/index.md)
- [Core API notes](https://github.com/coactionjs/coaction/blob/main/docs/api/core/documents/core-api-notes.md)

### Store Shape Mode (`sliceMode`)

`create()` uses `sliceMode: 'auto'` by default. For backward compatibility, `auto` still treats a non-empty object whose enumerable values are all functions as slices. That shape is ambiguous with a plain store that only contains methods, so development builds warn and you should set `sliceMode` explicitly.

You can force behavior explicitly:

- `sliceMode: 'single'`: treat object input as a single store.
- `sliceMode: 'slices'`: require object-of-slice-functions input.

```ts
create({ ping: () => 'pong' }, { sliceMode: 'single' });
create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' });
```

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).
