[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / TransportPolicy

# Type Alias: TransportPolicy

> **TransportPolicy** = `object`

Defined in: [packages/core/src/interface.ts:196](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L196)

## Properties

### allowedActions?

> `optional` **allowedActions**: readonly readonly `string`[][]

Defined in: [packages/core/src/interface.ts:198](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L198)

Further restrict action paths declared by the authoritative store.

---

### authorize()?

> `optional` **authorize**: (`request`) => `boolean` \| `Promise`\<`boolean`\>

Defined in: [packages/core/src/interface.ts:200](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L200)

Authorize a decoded JSON request before serving it.

#### Parameters

##### request

[`TransportPolicyRequest`](TransportPolicyRequest.md)

#### Returns

`boolean` \| `Promise`\<`boolean`\>
