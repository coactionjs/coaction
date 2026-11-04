---
'@coaction/react': patch
---

Do less work on each render. Every `observer()` and tracked selector keeps its
committed tracker and a spare, and a render tracks the spare again instead of
creating a tracker: a discarded render still leaves the committed dependencies
alone, and a commit swaps the two. Trackers of renders that never commit, and
of unmounted components, are released through one timer per delay instead of
one per render, and a commit drops its render's release at once. The walk of a
render or selector result for the state it carries allocates its revisit set
only below the result, and carries the frozen values a store hands out by
identity instead of walking them.

Together with this release's changes to `coaction`, js-store-benchmark's React
suites, measured in Chrome with `observer()`, update the workspace in about a
quarter of the time 4.1 took, keeping 40% less heap, and the counter in about a
fifth less time.
