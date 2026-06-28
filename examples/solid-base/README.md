# Solid Base Example

Minimal Solid example for `@coaction/solid`.

It demonstrates:

- a Zustand-style Coaction store
- Solid accessors returned by `useStore(selector)`
- `useStore({ autoSelector: true })` accessors and bound actions
- cached getter state (`double`)

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/solid-base --ignore-workspace install
pnpm --dir examples/solid-base --ignore-workspace build
```
