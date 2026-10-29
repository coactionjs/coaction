---
'coaction': patch
---

Compare a child before queueing it when a write checks the paths its readers
observed. The walk queued every child of a node that changed and compared it
afterwards, allocating for each one, so a write to one element of an array that
a thousand readers track took twice as long as it does now.
