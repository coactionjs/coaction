---
'@coaction/react': minor
---

Add whole selectors: `useStore(selector, { whole: true })` runs the selector
over the store's plain data, `getPureState()`, and tracks nothing. The
selection depends on the whole store -- every commit runs it again, and the
component re-renders only when the result changes by `Object.is`, or by an
`equals` passed beside `whole`. A selector that scans most of the state pays
for no proxy and no dependency per read, and while nothing tracks a store, its
writes skip the patch bookkeeping that tracking needs. Stores bound to a
mutable runtime, such as MobX, Valtio or Pinia, are compared by commit rather
than by the identity of their state, which those runtimes keep.
