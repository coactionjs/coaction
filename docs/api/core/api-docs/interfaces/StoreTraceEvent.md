[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreTraceEvent

# Interface: StoreTraceEvent

Defined in: [packages/core/src/interface.ts:34](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L34)

Trace envelope emitted before and after a store method executes.

## Properties

### id

> **id**: `string`

Defined in: [packages/core/src/interface.ts:38](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L38)

The id of the method.

---

### method

> **method**: `string`

Defined in: [packages/core/src/interface.ts:42](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L42)

The method name.

---

### parameters?

> `optional` **parameters**: `any`[]

Defined in: [packages/core/src/interface.ts:50](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L50)

The parameters of the method.

---

### result?

> `optional` **result**: `any`

Defined in: [packages/core/src/interface.ts:54](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L54)

The result of the method.

---

### sliceKey?

> `optional` **sliceKey**: `PropertyKey`

Defined in: [packages/core/src/interface.ts:46](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L46)

The slice key.
