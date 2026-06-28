# Adapter Base Example

Minimal adapter gallery for external state libraries.

It demonstrates:

- `@coaction/redux`
- `@coaction/jotai`
- `@coaction/valtio`
- `@coaction/xstate`

Each card exposes a Coaction-side update and a source-library update so you can see both directions stay synchronized.

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/adapters-base --ignore-workspace install
pnpm --dir examples/adapters-base --ignore-workspace build
```
