[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / create

# Variable: create

> `const` **create**: `Creator`

Defined in: [packages/core/src/create.ts:84](https://github.com/coactionjs/coaction/blob/main/packages/core/src/create.ts#L84)

Create a local store, the main side of a shared store, or a client mirror of
a shared store.

## Remarks

Prefer the static `coaction/local` entry when transport support is not
required. It excludes the JSON protocol and reconnect runtime from the
consumer dependency graph.
