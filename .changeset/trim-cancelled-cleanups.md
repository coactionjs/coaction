---
'@coaction/react': patch
---

Drop a render's tracker release as soon as its commit cancels it. Every tracked
render queued a release for ten seconds later and its commit cancelled it, but
the cancelled entry and a cancel closure stayed queued until the oldest entry's
timer ran, one per render. Cancelling now trims the cancelled entries off the
end of the queue, which is where a commit finds its own render's entry, so a
counter that renders a thousand times keeps about 37 KB less heap.
