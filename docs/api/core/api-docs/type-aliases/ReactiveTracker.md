[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / ReactiveTracker

# Type Alias: ReactiveTracker

> **ReactiveTracker** = `object`

Defined in: [packages/core/src/reactiveTracker.ts:20](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L20)

## Properties

### dispose()

> **dispose**: () => `void`

Defined in: [packages/core/src/reactiveTracker.ts:24](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L24)

#### Returns

`void`

---

### getSnapshot()

> **getSnapshot**: () => `number`

Defined in: [packages/core/src/reactiveTracker.ts:21](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L21)

#### Returns

`number`

---

### subscribe()

> **subscribe**: (`listener`) => () => `void`

Defined in: [packages/core/src/reactiveTracker.ts:22](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L22)

#### Parameters

##### listener

() => `void`

#### Returns

> (): `void`

##### Returns

`void`

---

### track()

> **track**: \<`T`\>(`fn`) => `T`

Defined in: [packages/core/src/reactiveTracker.ts:23](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L23)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T`

#### Returns

`T`
