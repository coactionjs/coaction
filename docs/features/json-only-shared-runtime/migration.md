# Migrating from Coaction 2.x to 3.x

Coaction 3.x uses a JSON-only shared transport and separate entry points for
local, shared, and adapter code. Local stores do not need to convert their
state to JSON when they use the local entry point.

## Select an entry point

```ts
// Local state without transport code.
import { create } from 'coaction/local';

// Shared authority or client mirror.
import { create } from 'coaction/shared';

// External-store adapter authoring.
import { defineExternalStoreAdapter } from 'coaction/adapter';
```

The root `coaction` entry remains compatible with local and shared `create()`
options, but it does not export adapter-authoring helpers.

## Convert shared values to JSON

Shared state, action arguments, and non-void action results may contain only
JSON data. Encode richer application values explicitly:

```ts
// 2.x application state
{ updatedAt: new Date(), selected: new Set(['a']) }

// 3.x shared state
{ updatedAt: new Date().toISOString(), selected: ['a'] }
```

Use `null`, booleans, strings, finite numbers, dense arrays, and plain records.
Do not send `undefined`, `BigInt`, non-finite numbers, negative zero, functions
as data, symbols, accessors, sparse arrays, platform objects, cycles, or shared
object references. Unsupported input throws before transport instead of being
silently changed by `JSON.stringify()`.

Store methods and computed getters can remain in the store definition; they are
not included in transported state.

## Restrict remote actions

The authority exposes only methods declared by its store. Narrow them when
needed:

```ts
create(state, {
  transport,
  transportPolicy: {
    allowedActions: [['increment']],
    authorize(request) {
      return request.type === 'fullSync' || canExecute(request.action);
    }
  }
});
```

Unexpected action errors are now redacted to `Remote action failed`. Expose a
domain error only when it is safe for every client connected to the transport:

```ts
transportPolicy: {
  mapError(error) {
    return error instanceof PublicOrderError ? error.message : undefined;
  }
}
```

Returning `undefined`, an empty string, or throwing from `mapError` keeps the
generic message.

## Handle authority changes

Client methods return promises because execution happens on the authority and
the client waits for its mirror to catch up. Sequence gaps and reconnects
trigger a full snapshot.

If the authority changes while a method is in flight, a response from the old
authority rejects with `ActionAuthorityChangedError`. Because its `outcome` is
`unknown`, do not retry a non-idempotent action automatically.

## Upgrade a transport cohort together

The 2.x and 3.x wire protocols are not compatible. Upgrade one authority and
all clients connected to it as a single cohort:

1. stop or drain writes;
2. destroy old client stores and close their ports;
3. stop the old authority;
4. deploy the authority and clients from the same immutable build;
5. verify full sync, one action, one update, and one reconnect before resuming
   traffic.

For a DedicatedWorker, terminate the old worker before constructing the new
one. Use a versioned worker URL so a new page cannot load a stale script.

A SharedWorker may outlive a tab. Close every old port, then use both a
versioned script URL and a release-specific worker name for the 3.x cohort. Do
not run 2.x and 3.x authorities concurrently against the same logical state.
Persist and restore an application-owned JSON snapshot if state must survive
the cutover.

For custom or remote transports, version the channel or routing key outside
Coaction. Rollback must also move the authority and every connected client
together.

## Adapter authors

Import adapter helpers from `coaction/adapter`. Binder-backed adapters remain
whole-store integrations and cannot be used as slices. An adapter may keep a
mutable external representation locally, but the snapshot exposed to shared
transport must satisfy the JSON contract.

See the [adapter contract](../../architecture/adapter-contract.md) for the
required lifecycle and shared-state behavior.
