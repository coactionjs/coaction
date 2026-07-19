---
'coaction': minor
'@coaction/history': minor
---

Add an adapter-level patch commit and replay bridge for authoritative store
transitions, including direct root replacements and middleware-scoped replay.

Move `@coaction/history` to a Travels-backed patch timeline for JSON-compatible
whole-store and partialized history. Add compact `getPatches()` access, lazy
legacy snapshot getters, and preserve snapshot compatibility for runtime-only
state.
