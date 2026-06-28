# Middleware Base Example

Minimal middleware example for Coaction.

It demonstrates:

- `@coaction/logger` with a custom in-app log sink
- `@coaction/persist` writing to `localStorage`
- `@coaction/history` undo/redo state snapshots

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/middlewares-base --ignore-workspace install
pnpm --dir examples/middlewares-base --ignore-workspace build
```
