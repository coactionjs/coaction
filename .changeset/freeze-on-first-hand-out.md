---
'coaction': patch
---

Freeze the values a store's initial state holds in one pass, when the store
first hands one out. Arrays and what they hold leave the store frozen. The copy
of the initial state lists them as it builds them, children before what holds
them, and the first object read through the state freezes and records the
whole list without walking it again. An alias or a cycle the copy cannot finish
is frozen when it is first handed out, and so is everything a commit before
that first read leaves behind. A store read only as plain data --
`getPureState()`, or whole selectors in `@coaction/react` -- hands nothing out,
so it freezes and records nothing. Compared with freezing the data as it is
copied in, a 1,000-task store read as plain data is created in about a third of
the time and keeps about 130 KB less heap in Node, and one whose first read
scans its tasks gets there about a fifth faster. Objects reached through object
keys are not frozen, and the factory's own objects are never touched.
