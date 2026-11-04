---
'coaction': patch
---

Reset a store with `store.setState(store.getInitialState())`. The object
`getInitialState()` returns holds the factory's methods, accessors and computed
values beside its data, and `setState()` rejected them as keys the state does
not have, so a store with any method threw `StateSchemaError` instead of
resetting -- in 4.1 as well. Given that object, directly or returned from a
recipe, `setState()` now takes its data alone. Any other value is checked as
before.
