---
'coaction': patch
'@coaction/react': patch
---

Re-track trackers across renders instead of creating one per render. Each
`observer()` and tracked selector keeps its committed tracker and a spare: a
render re-tracks the spare, so a discarded render still leaves the committed
dependencies alone, and a commit swaps the two. A notified tracker now keeps its
signal links until it re-tracks, so the re-track reuses them in place rather
than rebuilding them.
