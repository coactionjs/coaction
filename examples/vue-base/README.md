# Vue Base Example

Minimal Vue example for `@coaction/vue`.

It demonstrates:

- a Zustand-style Coaction store
- Vue computed selectors from `useStore(selector)`
- cached getter state (`double`)
- `useStore({ autoSelector: true })` selectors and bound actions

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/vue-base --ignore-workspace install
pnpm --dir examples/vue-base --ignore-workspace build
```
