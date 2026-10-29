---
'coaction': patch
---

Recognise the values a store hands out as themselves in `coaction/adapter`.
`trackReadonlyStateValue()` reports an array element read from the state as
state, and `getReadonlyStateValueVersion()` gives it a constant version: the
element never changes, a write replaces it. A derived or selector result that
carries an element therefore propagates its changes even when result equality
calls the result unchanged, and an object frozen anywhere else is still plain
data that the result walk traverses.
