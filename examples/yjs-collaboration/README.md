# Yjs Collaboration Example

Minimal browser collaboration example for Coaction and `@coaction/yjs`.

It demonstrates:

- Binding two Coaction stores to separate `Y.Doc` instances
- Relaying Yjs updates between peers like a provider would
- Keeping local Coaction actions and remote Yjs updates in sync
- Disconnecting and reconnecting peers to see CRDT state merge

## Run

```bash
pnpm install
pnpm dev
```

From the repository root, you can validate it as a standalone example with:

```bash
pnpm --dir examples/yjs-collaboration --ignore-workspace install
pnpm --dir examples/yjs-collaboration --ignore-workspace build
```
