[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / LocalStoreOptions

# Type Alias: LocalStoreOptions\<T\>

> **LocalStoreOptions**\<`T`\> = `Omit`\<[`StoreOptions`](StoreOptions.md)\<`T`\>, `"clientTransport"` \| `"executeSyncTimeoutMs"` \| `"transport"` \| `"transportPolicy"` \| `"worker"` \| `"workerType"`\>

Defined in: [packages/core/src/interface.ts:370](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L370)

Options accepted by the statically isolated local-store entry point.

## Type Parameters

### T

`T` _extends_ `CreateState`
