---
'coaction': patch
---

Commit local writes without a patch journal for read sets of any size. When no
transport, commit listener, patch middleware or cached getter snapshot needs
the patch pair, a write compares the paths its readers observed, descending
only into what changed identity. Stores with more than eight live dependencies
used to produce and certify a full journal on every write instead.
