---
'coaction': minor
---

Read `getInitialState()` from the store's own first root. A native store kept
the object its factory returned for `getInitialState()`, holding all of its
data a second time beside the store's own copy for as long as the store lived.
It now keeps only the factory's methods, accessors and computed definitions,
and the first call returns a copy of the store's initial data shaped like the
factory's object: the same keys and attributes, the factory's own functions,
and data equal to what the factory returned. Every call returns that same
object, and changing it does not change the store. It is no longer the
factory's object itself. Stores bound to another runtime, such as MobX or
Zustand, return what that runtime provided, as before. A 1,000-task store
keeps about 200 KB less heap.
