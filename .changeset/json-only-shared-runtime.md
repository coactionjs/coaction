---
'coaction': major
'@coaction/history': major
'@coaction/jotai': major
'@coaction/logger': major
'@coaction/mobx': major
'@coaction/ng': major
'@coaction/persist': major
'@coaction/pinia': major
'@coaction/react': major
'@coaction/redux': major
'@coaction/solid': major
'@coaction/svelte': major
'@coaction/valtio': major
'@coaction/vue': major
'@coaction/xstate': major
'@coaction/yjs': major
'@coaction/zustand': major
---

Adopt a JSON-only shared-store contract and versioned string wire protocol.
Shared state, action arguments/results, patches, and snapshots now reject
non-JSON or lossy JavaScript values before transport. Client mirrors use
authority epochs and contiguous sequences to recover reconnects and update
gaps, while remote execution is limited to declared action paths and optional
transport policy.

Add static `coaction/local`, `coaction/shared`, and `coaction/adapter` entry
points. Adapter-authoring helpers move from the root export to
`coaction/adapter`; official adapters now expose plain JSON transport snapshots
without linking adapter internals into the core runtime.

Read the [Coaction 3.0 migration guide](https://github.com/coactionjs/coaction/blob/v3.0.0/docs/features/json-only-shared-runtime/migration.md)
before upgrading any Worker, SharedWorker, injected-transport, or custom-adapter
deployment.
