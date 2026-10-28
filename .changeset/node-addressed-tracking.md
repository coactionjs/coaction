---
'coaction': patch
---

Record tracked reads against the reactive path node a state proxy already
holds. A read no longer builds a path array, walks the dependency trie from its
root or updates a map: repeated reads are deduplicated with a collection stamp,
and signal links are established once per dependency when the collection ends.
Components and selectors that scan large collections spend a fraction of the
time they did collecting dependencies.
