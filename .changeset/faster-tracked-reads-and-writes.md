---
'coaction': patch
---

Track reads and commit local writes with less work. Measured in Node 24 against
4.1.0, with a store of 1,000 tasks:

- The first tracked scan of the tasks takes about 40% of the time, and a write
  to one task followed by the same scan less than a tenth.
- A counter's thousand increments, each read again, take about 40% less time.
- In a store that needs the patch pair -- `enablePatches`, a transport or a
  commit listener -- a write to one element of 10,000 takes about a fifth of
  the time.

A tracked read is recorded against the reactive path node its state proxy
already holds, deduplicated with a collection stamp, and linked once per
dependency when the collection ends, instead of building a path array and
walking the dependency trie on every read. A tracker from
`createReactiveTracker()` keeps its signal links until it tracks again, and
reuses them. A local write that needs no patch pair compares the paths its
readers observed, descending only into what changed identity, for read sets of
any size; one that only sets values on the root's own keys copies the root
instead of creating a Mutative draft, and keeps the root's shape without
checking it again. A store that needs the patch pair no longer compares every
element of each array along a written path when its recipe read nothing beside
that path.

Comparing the observed paths takes a step for every tracked child of a node
that changed; 4.1 followed the patch journal instead once more than eight
dependencies were live. A write to one element of an array whose elements are
each tracked by a reader of their own -- rows of a list that each read their
own element -- therefore takes longer than in 4.1: about 1.5 times as long with
1,000 such readers, and three to five times as long with 10,000.
