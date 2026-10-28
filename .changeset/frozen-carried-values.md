---
'@coaction/react': patch
---

Stop walking a render result or selector result at the frozen values a store
hands out. Array elements are values now, so passing them through props made
the walk descend through each element; it is carried by identity instead,
which also keeps a reused wrapper that carries an element reactive.
