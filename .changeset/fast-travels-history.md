---
'coaction': minor
'@coaction/history': minor
---

Add an adapter-level patch commit and replay bridge for authoritative store
transitions, including direct root replacements and middleware-scoped replay.

Move `@coaction/history` to a Travels-backed patch timeline for JSON-compatible
whole-store and partialized history. Require `travels@^2.1.0` and use its
controlled journal to hand core commits directly to `recordPatches()` and
generate patch pairs for derived partialized commits without calling
state-owning journal APIs. Add compact `getPatches()` access and lazy legacy
snapshot getters for runtime-only state compatibility.
