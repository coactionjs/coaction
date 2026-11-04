---
'coaction': patch
---

Read through an object that was frozen before a recipe assigned it to the
state, such as a constant passed through `Object.freeze()` or data another
library froze. Its readonly view returned proxies for the object's properties,
which JavaScript forbids for the read-only, non-configurable properties of a
frozen object, so reading one that held an object -- `state.config.theme` --
threw a `TypeError` saying the proxy "did not return its actual value". The
view now returns the object the property holds, frozen as the other values a
store hands out are, and a write through the view still throws.
