---
'coaction': patch
---

Scan arrays as a whole. Read-only array methods called through the public
state -- `filter`, `map`, `find`, `some`, `reduce`, `slice`, `for...of` and the
rest -- take one dependency on the array and run over the array itself instead
of trapping and tracking every element they read. State read inside a callback
is still tracked, and methods that mutate the array still fail outside `set()`.
