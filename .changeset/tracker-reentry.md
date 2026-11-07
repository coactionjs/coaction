---
'coaction': patch
---

Keep a reactive tracker's dependencies when its callback calls `track()` on it
again, directly or through another tracker: the reads of the outer evaluation
were lost, so a change to them no longer notified. A tracker disposed from inside
its own callback now leaves no dependency behind, and no longer leaves its
collection active for the trackers that run after it.
