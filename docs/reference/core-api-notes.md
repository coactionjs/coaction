# Core API Notes

## `create()` Input Shapes

`create()` accepts either a single store factory or an object of slice factories. The object form becomes ambiguous when every enumerable value is a function, because it can mean either:

- a plain store object that only exposes methods
- a slices object where each property is a slice factory

For that reason, use `sliceMode: 'single'` or `sliceMode: 'slices'` explicitly for function maps.

## Local/Main Stores vs Client Stores

Passing `transport` creates the main/shared store. Passing `clientTransport` or `worker` creates a client mirror of that shared store.

Client stores have two important differences:

- store methods return promises because execution happens on the main store
- direct `setState()` calls are rejected on the client; mutate through a store method instead

## Immutable Mutation Boundary

Native Coaction stores are immutable stores. Methods and getters can read through `this`, but any write to Coaction-owned state must happen inside `set()`:

```ts
const store = create((set) => ({
  count: 0,
  step: 1,
  incrementWrong() {
    this.count += this.step; // throws
  },
  increment() {
    set(() => {
      this.count += this.step;
    });
  }
}));
```

`set()` is the commit boundary. Coaction uses that boundary to run Mutative, produce the immutable next state, notify subscribers, invalidate computed values, create patches and inverse patches when patches are enabled, and emit patch sequences to worker/client mirrors in shared mode. A direct mutation outside `set()` would mutate a raw object without a Coaction commit, so local listeners, middleware, computed caches, patches, and remote mirrors could diverge.

The same rule applies in slices mode. `this` points at the current slice, so use the root draft when an action needs to write across slices:

```ts
incrementByStep() {
  set((draft) => {
    draft.counter.count += draft.settings.step;
  });
}
```

This rule applies to native immutable Coaction stores and framework wrappers built on core, such as `@coaction/react` and `@coaction/vue`. External observable adapters such as MobX, Pinia, and Valtio follow their own mutation model, but adapter updates still have to notify Coaction through the adapter contract.

## `getState()` Method Binding

Store methods and slice methods are rebound to the latest state object when they are invoked. This makes patterns like the following safe even when the method body relies on `this`:

```ts
const { increment } = store.getState();
increment();
```

The same rule applies to slices:

```ts
const { increment } = store.getState().counter;
increment();
```

## External Adapter Boundaries

`defineExternalStoreAdapter()` is intended for whole-store adapters that bridge external state systems such as Redux, Zustand, Jotai, Pinia, MobX, or Valtio. `createBinder()` remains available as the compatibility name for existing adapters.

Both helpers are exported from `coaction/adapter`, not from the root
compatibility entry.

Binder-backed stores are not compatible with Coaction slices mode. If an external integration should live under a slice key, wrap the entire external store instead of mixing it into a slices object.

## API Evolution Boundary

`create()` should be treated as a closed polymorphic surface, not an open-ended bucket for new semantics.

What that means in practice:

- do not mix main-store and client-store transport settings in one call
- do not pass multiple client transport sources in one call
- prefer explicit helpers or `createXxx` variants for future expansion instead of new ambiguous overloads

The compatibility-only `workerType` options remain available, but they are not the preferred path for new API design.
