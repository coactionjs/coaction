---
'coaction': patch
---

Create stores faster and keep less of their data. Measured in Node 24 against
4.1.0, creating a store of 1,000 tasks takes about a third less time, and,
with `getInitialState()` reading the store's own root, the store keeps about
70 KB -- 28% -- less heap.

The initial state is copied into the store with object literals laid out like
their source, dense arrays are copied by index, and the memo of a copy lives
only as long as the copy. Its values are no longer frozen as they are copied:
the copy lists them, children before what holds them, and the store freezes the
whole list in one pass when it first hands one out, so a store read only as
plain data -- `getPureState()`, or whole selectors in `@coaction/react` --
freezes nothing. After a write, the elements of the array a scan receives are
frozen by index, skipping those already frozen. `sanitizeInitialStateValue` and
`sanitizeReplacementState` still accept a `WeakMap` memo.
