---
'coaction': minor
'@coaction/react': minor
---

Hand array elements out as values. An element read from the state of a native
store -- by index, found by a scan or returned by a getter -- is the element
itself, frozen, rather than a readonly proxy, so it is the same object however
it was reached, `getPureState()` included. Objects reached through object keys
are still readonly proxies, and stores bound to another runtime through an
adapter are unchanged. An object held both in an array and at an object key has
one public identity, the first it was read with: `state.selected` and
`state.items[0]` stay the same object, whichever is read first.

A reader depends on the identity of the elements it reads: structural sharing
gives an element a new identity when anything inside it changes, and leaves its
siblings untouched. Read-only array methods called through the state --
`filter`, `map`, `find`, `some`, `reduce`, `slice`, `for...of` and the rest --
take one dependency on the array and run over the array itself instead of
tracking every element they visit; state read inside a callback is still
tracked. An `observer()` that renders one field of an element therefore
re-renders after any write inside that element, and one that renders a scan
after a write to any element. A selector of the same field or scan result
re-renders only when its result changes, as before.

A write to an element outside `set()` throws a `TypeError` from the frozen value
in strict-mode code, and is silently ignored in sloppy-mode scripts, where the
readonly proxy threw Coaction's error. The values of the initial state are
frozen when the store first hands one out, so a store read only through
`getPureState()` or whole selectors freezes nothing.

In `coaction/adapter`, `trackReadonlyStateValue()` reports an element read from
the state as state, and `getReadonlyStateValueVersion()` gives it a constant
version: the element never changes, a write replaces it. A derived or selector
result that carries an element keeps propagating its changes even when result
equality calls the result unchanged.

See `docs/migration/v4.2.md`.
