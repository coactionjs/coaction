---
'@coaction/react': patch
---

Create the set that stops a revisit while walking a render or selector result
only once the walk goes below the result itself. A leaf component's result --
an element with primitive props -- no longer allocates one on every render.
