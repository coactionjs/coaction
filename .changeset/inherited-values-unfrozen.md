---
'coaction': patch
---

Hand out only an object's own values as frozen state. Reading `__proto__`
through the readonly view of a frozen object in the state -- an object a recipe
assigned as it was -- took the inherited `Object.prototype` for a state value
and froze it, for the whole program.
