---
'coaction': patch
---

Resolve the active subscriber and collection once per tracked property read.
Marking the parent as traversed, resolving the child node and recording it are
now one call instead of three that each looked the subscriber up again.
