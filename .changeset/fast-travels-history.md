---
'coaction': minor
'@coaction/history': minor
---

Add an adapter-level patch commit and replay bridge for authoritative store
transitions, including direct root replacements and middleware-scoped replay.

Move `@coaction/history` to a Travels-backed patch timeline for JSON-compatible
whole-store and partialized history. With Travels 2.1 or newer, use its
controlled journal to hand core commits directly to `recordPatches()` and
generate patch pairs for derived partialized commits without calling
state-owning journal APIs. Add compact `getPatches()` access and lazy legacy
snapshot getters.

Keep the declared `travels@^2.0.0` range so existing Travels 2.0 lockfiles retain
the feature-detected patch-replay fallback and runtime-only state retains
snapshot compatibility. Publish this release after `travels@2.1.0`; fresh
installs can then resolve the native controlled-journal path automatically.
