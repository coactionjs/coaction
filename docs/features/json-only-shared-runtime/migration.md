---
type: runbook
title: Migrating from Coaction 2.x to the 3.x JSON-only shared runtime
description: Import, state-model, transport, and adapter changes required when upgrading to Coaction 3.x.
owner: unadlib
status: accepted
risk_level: critical
tags: [core, transport, json, migration, bundle-size]
---

## Who needs to migrate

Local-only stores continue to support ordinary JavaScript state. Migration is
required when an application:

- creates a Worker, SharedWorker, or injected-transport store;
- sends non-JSON state, arguments, or action results across that boundary; or
- imports adapter-authoring helpers from the root `coaction` entry.

## Choose a static entry

Use the smallest entry that owns the capability:

```ts
// Local state; no transport runtime is linked.
import { create } from 'coaction/local';

// Shared authority or client mirror.
import { create } from 'coaction/shared';

// External store adapter implementation.
import {
  defineExternalStoreAdapter,
  replaceExternalStoreState
} from 'coaction/adapter';
```

The root `coaction` entry remains a compatibility entry with local/shared mode
selection. It no longer re-exports adapter-authoring utilities.

## Convert shared state to JSON trees

Represent dates, maps, sets, binary data, and other platform objects explicitly
in application data:

```ts
// Before: not part of the shared contract.
{ updatedAt: new Date(), selected: new Set(['a']) }

// After: lossless JSON data with application-owned decoding.
{ updatedAt: new Date().toISOString(), selected: ['a'] }
```

Shared values may contain finite numbers, strings, booleans, null, dense arrays,
and plain records. Unsupported values fail before transport rather than being
silently normalized. This includes `undefined`, `BigInt`, non-finite numbers,
negative zero, functions in data, symbols, accessors, custom platform objects,
sparse arrays, cycles, and repeated references.

## Remote methods and errors

Only action paths declared by the authoritative store can execute remotely.
Use `transportPolicy.allowedActions` to expose a smaller subset and
`transportPolicy.authorize` for application-specific request authorization.
Action errors now use a tagged JSON result, so domain objects containing legacy
keys such as `$$Error` remain ordinary data.

Coaction 3.0 redacts unexpected execute errors to `Remote action failed` by
default. An authority that intentionally exposes domain errors must map them to
a client-safe string. The mapper runs as trusted authority code; never include
credentials, internal paths, stack traces, or private user data:

```ts
transportPolicy: {
  mapError(error) {
    return error instanceof PublicOrderError ? error.message : undefined
  }
}
```

Returning `undefined`, returning an empty string, or throwing from `mapError`
keeps the generic message.

## Reconnect behavior

Every authority lifetime has an epoch and every committed update has a
sequence. Clients apply only the next update for the active epoch. A new epoch
or sequence gap triggers a full JSON snapshot; stale and duplicate updates are
ignored. Applications should await client methods because their promise now
also waits for the mirrored state to catch up.

If the authority changes while an action is in flight and its response belongs
to the superseded authority, the promise rejects with
`ActionAuthorityChangedError`. Its `code` is
`COACTION_ACTION_AUTHORITY_CHANGED` and its `outcome` is `unknown`: the old
authority may already have committed a state change or external side effect.
Do not automatically retry unless the action is idempotent or the application
has its own deduplication key.

## Coordinate the 2.x to 3.x deployment

Coaction 2.x and the 3.x runtime are not wire-compatible. The 3.x
runtime sends version-tagged JSON strings and rejects the legacy message
shapes. There is no protocol negotiation, downgrade path, or mixed-version
compatibility shim. An authority and every client connected to it MUST run the
same Coaction major, including the matching official adapter versions.

Treat one authority and all of its clients as a single deployment cohort:

1. Stop or drain writes for that cohort.
2. Destroy every old client store and close its transport connection.
3. Stop the old authority.
4. Deploy the new authority and clients from the same immutable build.
5. Verify `fullSync`, one remote action, one incremental update, and one
   reconnect before restoring traffic.

Do not perform a rolling upgrade in which a 2.x authority serves 3.x
clients, or the reverse. Protocol failures are intentionally fail-closed, but
they are not an application-level availability or state-handoff mechanism.

### DedicatedWorker

Destroy the client store, terminate the old worker, and then construct the new
client and worker from the same release. Prefer a content-hashed or otherwise
versioned worker URL so an HTML update cannot reuse a stale cached worker
script.

### SharedWorker

A SharedWorker can outlive one page and is reused by matching constructor URL
and name. For one logical shared store, first arrange a coordinated reload or
maintenance window so all 2.x tabs destroy their stores and release their
ports. If the application owns additional `MessagePort` objects, close those
too. Only then start the 3.x cohort.

Use both an immutable script URL and a release-specific worker name, for
example:

```ts
const worker = new SharedWorker(
  new URL('./coaction-store-v3.js', import.meta.url),
  { name: 'coaction-store-v3', type: 'module' }
);
```

Changing both values prevents a new page from attaching to the old worker, but
it does not make two live authorities safe. Do not let the 2.x and 3.x
SharedWorkers concurrently own the same logical state. If state must survive
the cutover, persist an application-owned JSON snapshot before draining 2.x and
use it to initialize the new authority; Coaction does not transfer state
between protocol generations.

The browser matching and lifetime behavior follows the HTML SharedWorker
specification listed under Citations.

### Injected or remote transports

Version the channel, topic, endpoint, or routing key outside Coaction. Drain the
old cohort and atomically switch routing to the new one, or run blue/green
cohorts on completely isolated channels until cutover. A zero-downtime bridge,
if required, is application infrastructure and must explicitly translate and
validate both protocols; it is not supplied by Coaction.

Rollback follows the same rule: roll back the authority and every client in the
cohort together. Never roll back only one side of a live transport.

## Adapter authors

Mutable adapters may keep proxy/accessor internals locally, but they must expose
a plain transport snapshot through the adapter boundary. Official MobX, Pinia,
and Valtio adapters do this without adding their implementation machinery to
the local or shared core entry.

## Human review

Repository-level 3.0 acceptance is recorded in the
[rollout plan](rollout.md#human-review). Before deployment, the application
owner MUST still confirm the complete authority/client cohort inventory, the
SharedWorker drain and state-handoff plan, and an all-members rollback
procedure.

## Verification

- Core behavior: `pnpm --filter coaction test`
- Full workspace and release gates: `pnpm check`
- Coverage: `pnpm test:coverage`
- Worker and SharedWorker browsers: `pnpm test:e2e:browser`
- Package and consumer sizes: `pnpm package:size`
- Package exports: `pnpm package:quality`
- Major metadata: `ALLOW_MAJOR_RELEASE=1 pnpm changeset:check`

# Citations

- [HTML Standard — Shared workers and the SharedWorker interface](https://html.spec.whatwg.org/multipage/workers.html#shared-workers-and-the-sharedworker-interface)
