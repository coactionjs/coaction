[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Store

# Interface: Store\<T\>

Defined in: [packages/core/src/interface.ts:66](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L66)

Runtime store contract returned by [create](../variables/create.md) before framework-specific
wrappers add selectors or reactivity helpers.

## Remarks

`getState()` returns methods and getters alongside plain data. Methods
extracted from the returned object keep the correct `this` binding when they
are later invoked.

## Extended by

- [`MiddlewareStore`](MiddlewareStore.md)

## Type Parameters

### T

`T` _extends_ [`ISlices`](../type-aliases/ISlices.md) = [`ISlices`](../type-aliases/ISlices.md)

## Properties

### apply()

> **apply**: (`state?`, `patches?`) => `void`

Defined in: [packages/core/src/interface.ts:134](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L134)

Apply patches to the current state.

#### Parameters

##### state?

`T`

##### patches?

`Patches`

#### Returns

`void`

#### Remarks

This is a low-level hook used by transports and middleware. Application
code should generally prefer store methods or `setState()`. Client-side
shared-store mirrors reject direct `apply()` calls.

---

### destroy()

> **destroy**: () => `void`

Defined in: [packages/core/src/interface.ts:112](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L112)

Tear down the store.

#### Returns

`void`

#### Remarks

`destroy()` is idempotent. It clears subscriptions and disposes any
attached transport.

---

### getInitialState()

> **getInitialState**: () => `T`

Defined in: [packages/core/src/interface.ts:146](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L146)

Return the state produced during initialization before later mutations.

#### Returns

`T`

---

### getPureState()

> **getPureState**: () => `T`

Defined in: [packages/core/src/interface.ts:142](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L142)

Return the current state without methods or getters.

#### Returns

`T`

#### Remarks

Useful for serialization, inspection, or tests that only care about raw
data.

---

### getState()

> **getState**: () => `T`

Defined in: [packages/core/src/interface.ts:98](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L98)

Read the current state object.

#### Returns

`T`

#### Remarks

The returned object includes methods and getters. Methods destructured from
this object continue to execute against the latest store state.

---

### isSliceStore

> **isSliceStore**: `boolean`

Defined in: [packages/core/src/interface.ts:125](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L125)

Whether `createState` was interpreted as a slices object.

---

### name

> **name**: `string`

Defined in: [packages/core/src/interface.ts:70](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L70)

The name of the store.

---

### ~~patch()?~~

> `optional` **patch**: (`option`) => [`PatchTransform`](PatchTransform.md)

Defined in: [packages/core/src/interface.ts:151](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L151)

#### Parameters

##### option

[`PatchTransform`](PatchTransform.md)

#### Returns

[`PatchTransform`](PatchTransform.md)

#### Deprecated

Middleware compatibility hook. Prefer typing middleware stores
with `MiddlewareStore`.

---

### setState()

> **setState**: (`next`, `updater?`) => `void`

Defined in: [packages/core/src/interface.ts:79](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L79)

Mutate the current state.

#### Parameters

##### next

The next partial state, or an updater that mutates a draft.

`DeepPartial`\<`T`\> | (`draft`) => `any` | `null`

##### updater?

(`next`) => \[\] \| \[`T`, `Patches`, `Patches`\]

Low-level updater hook used by transports and middleware integrations.

#### Returns

`void`

#### Remarks

Pass a deep-partial object to merge fields, or pass an updater to edit a
Mutative draft. Passing `null` is a no-op. Client-side shared stores intentionally reject direct
`setState()` calls; trigger a store method instead.

---

### share?

> `optional` **share**: `false` \| `"main"` \| `"client"`

Defined in: [packages/core/src/interface.ts:117](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L117)

Indicates whether the store is local, the main shared store, or a client
mirror of a shared store.

---

### subscribe()

> **subscribe**: (`listener`) => () => `void`

Defined in: [packages/core/src/interface.ts:104](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L104)

Subscribe to state changes.

#### Parameters

##### listener

`Listener`

#### Returns

A function that removes the listener.

> (): `void`

##### Returns

`void`

---

### ~~trace()?~~

> `optional` **trace**: (`options`) => `void`

Defined in: [packages/core/src/interface.ts:156](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L156)

#### Parameters

##### options

[`StoreTraceEvent`](StoreTraceEvent.md)

#### Returns

`void`

#### Deprecated

Middleware compatibility hook. Prefer typing middleware stores
with `MiddlewareStore`.

---

### transport?

> `optional` **transport**: `Transport`\<`any`\>

Defined in: [packages/core/src/interface.ts:121](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L121)

Transport used to synchronize a shared store between processes or threads.
