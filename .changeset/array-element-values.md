---
'coaction': minor
'@coaction/react': minor
---

Hand array elements out as values. An element read from the public state by
index, found by a scan or returned by a getter is now the frozen element itself
rather than a readonly proxy, so it is the same object however it was reached,
including `getPureState()`. A reader depends on the identity of the elements it
reads: structural sharing gives an element a new identity when anything inside
it changes, and leaves its siblings untouched. Writing to an element outside
`set()` throws a `TypeError` from the frozen value instead of the readonly
proxy's error. Objects reached through object keys are still readonly proxies,
and adapter-backed stores are unchanged.
