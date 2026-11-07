---
'coaction': patch
---

Depend on an inherited property that a tracked read returns, so a write that
shadows it with an own property notifies the reader.
