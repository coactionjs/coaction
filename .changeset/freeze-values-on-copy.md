---
'coaction': patch
---

Freeze the values a store hands out as its initial state is copied in. Arrays
and what they hold leave the store frozen, and they were frozen by a second
walk over them on the first read or scan of each array -- at startup, for a
store whose first render scans its lists. The copy now freezes them as it
builds them, children before their containers, and leaves open anything it
cannot finish: an alias reached first through an object key, or a cycle, is
still frozen when it is first handed out. Objects reached through object keys
are not frozen, and the factory's own objects are never touched. Coaction's
startup work for a 1,000-task store drops by about two fifths.
