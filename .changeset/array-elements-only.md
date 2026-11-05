---
'coaction': minor
---

An array's state is its elements. `create()` and `setState({ ... })` now leave
out an array's named keys and symbols -- `Object.assign(rows, { meta })` -- and
warn once in development. A recipe's first write to such an array already
dropped them without a warning, because Mutative and Immer copy only an array's
elements, so a reader saw them or not depending on whether a write had happened.
While they lasted they also made each commit's patch a replacement of the whole
root. Keep such a value in an object beside the array. An array that a recipe
assigns is stored as it is.
