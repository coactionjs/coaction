---
'coaction': patch
---

Copy each state object into the store with the layout of its source. An
object copied in was built up from `{}`, which keeps four properties in the
object itself and the rest in a separate array, so a copy of a literal with two
fields carried two unused slots and one with seven carried an array beside it.
Copies are now spread from their source and keep its layout. What they hold is
unchanged: the same keys in the same order, each getter read once, and a source
holding an unsafe key is still copied without reading it. A 1,000-task store
takes about 60 KB less heap in Node, and is created as fast as before.
