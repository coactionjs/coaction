---
'coaction': patch
---

Require Mutative 2.0.2, as `@coaction/history` now does too. Under Mutative
2.0.0, deleting an index past the end of an array in a recipe --
`delete state.list[10]` on a shorter list -- lengthened the array through that
index with `undefined` elements, which notified the readers of its length and,
in a store with a commit listener, published a commit. Such a delete now leaves
the state as it was, as it does in JavaScript.
