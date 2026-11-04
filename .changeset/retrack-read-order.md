---
'coaction': patch
---

Keep every dependency of a tracker from `createReactiveTracker()` in
`coaction/adapter` that tracks again in another read order. alien-signals
skips relinking a signal whose last link already carries the current cycle,
and a tracker tracks outside alien-signals' own runs, so a second `track()`
with no signal written since the first dropped a dependency it read earlier
than before, and stopped hearing about it. The React bindings now track each
component's tracker again on every render, and rely on this.
