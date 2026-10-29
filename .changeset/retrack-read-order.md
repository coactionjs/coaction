---
'coaction': patch
---

Keep every dependency of a reactive tracker that re-tracks in another read
order. alien-signals skips relinking a signal whose last link already carries
the current cycle, and a tracker re-tracks outside alien-signals' own runs, so a
pass that ran before anything else moved the cycle -- a re-render with no store
write since the last one -- dropped a dependency it read earlier than before,
and stopped hearing about it.
