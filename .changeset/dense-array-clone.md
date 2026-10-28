---
'coaction': patch
---

Copy and freeze state arrays by index. Cloning initial and replacement state
classified every key of every array, and freezing an element visited every
primitive below it; a dense array without named extras -- nearly every state
array -- is now copied by index, and only unfrozen objects are queued to freeze.
