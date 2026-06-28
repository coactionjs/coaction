# Angular Signals Base Example

Minimal Angular Signals example for `@coaction/ng`.

It demonstrates:

- a Zustand-style Coaction store
- Angular `Signal` values from `store.select(...)`
- cached getter state (`double`)
- bound actions that update the signal-backed store

This example intentionally uses Angular signals without a full Angular CLI app so the adapter contract stays visible and lightweight.

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/ng-base --ignore-workspace install
pnpm --dir examples/ng-base --ignore-workspace build
```
