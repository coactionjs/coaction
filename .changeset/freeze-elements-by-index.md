---
'coaction': patch
---

Freeze an array's elements by index. A write hands the next scan a fresh copy
of the array it touched, and freezing that copy listed one key per element
before checking whether each element was already frozen.
