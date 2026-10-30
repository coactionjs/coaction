---
'coaction': patch
---

Skip the root shape check when a local recipe kept the root's keys. Every write
listed the keys of the next root to refuse any the schema does not know, and
allocated along the way. A recipe that only wrote to keys the root already had
leaves exactly the committed root's keys, which the schema accepted, so that
check is no longer repeated for it; a new key, or anything that needs a draft,
is still checked. The check itself no longer allocates per key.
