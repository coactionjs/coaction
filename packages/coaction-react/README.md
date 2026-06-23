# @coaction/react

![Node CI](https://github.com/coactionjs/coaction/workflows/Node%20CI/badge.svg) [![npm](https://img.shields.io/npm/v/@coaction/react.svg)](https://www.npmjs.com/package/@coaction/react) ![license](https://img.shields.io/npm/l/@coaction/react)

A Coaction integration tool for React

## Installation

You can install it via npm, yarn or pnpm.

```sh
npm install coaction @coaction/react
```

## Compatibility

`@coaction/react` currently supports React 17, 18, and 19.

The package intentionally uses `use-sync-external-store/shim` internally so the same published build can work across those React versions. Removing the shim would require dropping React 17 support in a future major release.

## Usage

```jsx
import { create, observer } from '@coaction/react';

const useStore = create((set) => ({
  count: 0,
  label: 'counter',
  increment: () => set((state) => state.count++)
}));

const CounterComponent = observer(() => {
  const store = useStore();
  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>Increment</button>
    </div>
  );
});
```

Wrap components with `observer()` when you want MobX/Vue-style automatic render tracking. Inside an observed render, `useStore()` does not subscribe to the whole store; the component re-renders only when the Coaction state/getters it read during render change. Without `observer()`, `useStore()` remains a whole-store subscription.

For smaller render regions, use `<Observer>`:

```tsx
import { Observer } from '@coaction/react';

const CounterValue = () => (
  <Observer>
    {() => {
      const store = useStore();
      return <span>{store.count}</span>;
    }}
  </Observer>
);
```

For selector-heavy components, `autoSelector` returns a cached selector map instead of values. Hook calls stay explicit:

```tsx
const selectors = useStore.auto();

const CounterComponent = () => {
  const count = useStore(selectors.count);
  const increment = useStore(selectors.increment);
  return <button onClick={increment}>Count: {count}</button>;
};
```

`useStore({ autoSelector: true })` is kept as an alias for `useStore.auto()`.

`autoSelector` is generated from the store shape known during initialization. If your application adds new keys at runtime, prefer explicit selectors such as `useStore((state) => state.dynamic[key])` for those paths instead of expecting the cached selector map to grow dynamically.

## Documentation

You can find the documentation [here](https://github.com/coactionjs/coaction).
