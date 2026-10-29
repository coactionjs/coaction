---
'coaction': patch
---

Certify a single write from what its recipe read. A store that needs the patch
pair -- `enablePatches`, a transport or a commit listener -- compared every
element of each array along a written path, to catch a copy the patches did not
report. A recipe copies an element only by reading it, so a write whose recipe
read nothing beside its own path now skips that comparison, which makes a write
into a 10,000-element array about three times as fast.
