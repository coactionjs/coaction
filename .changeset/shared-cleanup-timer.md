---
'@coaction/react': patch
---

Release trackers of uncommitted renders and unmounted components through one
timer per delay instead of a timer per component. Every first render used to
arm a ten-second timer that its commit then cleared; it now queues a cancelable
entry, and each entry is still released exactly when its own delay ends.
