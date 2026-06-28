# Svelte Base Example

Minimal Svelte example for `@coaction/svelte`.

It demonstrates:

- a Zustand-style Coaction store
- Svelte readable stores returned by `store.select(...)`
- cached getter state (`double`)
- bound actions called from Svelte event handlers

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/svelte-base --ignore-workspace install
pnpm --dir examples/svelte-base --ignore-workspace build
```
