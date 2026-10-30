---
'coaction': patch
---

Copy initial and replacement state faster. Every object copied into the store
was created through `Object.create`, listed into a combined key array first,
and remembered in a `WeakMap`. A plain object now starts as a literal, its keys
are read where `Object.keys` and `Object.getOwnPropertySymbols` list them, and
the memo of one copy is a `Map`, which lives exactly as long as that copy. The
first copy of a 1,000-task state, which runs cold at startup, takes about a
third less time. `sanitizeInitialStateValue` and `sanitizeReplacementState`
still accept a `WeakMap` memo.
