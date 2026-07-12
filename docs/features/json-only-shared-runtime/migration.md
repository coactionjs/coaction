---
type: migration-guide
title: Migrating to the JSON-only shared runtime
description: Import, state-model, transport, and adapter changes required by Coaction's JSON-only shared contract.
owner: unadlib
status: proposed
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

## Reconnect behavior

Every authority lifetime has an epoch and every committed update has a
sequence. Clients apply only the next update for the active epoch. A new epoch
or sequence gap triggers a full JSON snapshot; stale and duplicate updates are
ignored. Applications should await client methods because their promise now
also waits for the mirrored state to catch up.

## Adapter authors

Mutable adapters may keep proxy/accessor internals locally, but they must expose
a plain transport snapshot through the adapter boundary. Official MobX, Pinia,
and Valtio adapters do this without adding their implementation machinery to
the local or shared core entry.

## Verification

- Core behavior: `pnpm --filter coaction test`
- Full workspace and release gates: `pnpm check`
- Coverage: `pnpm test:coverage`
- Worker and SharedWorker browsers: `pnpm test:e2e:browser`
- Package and consumer sizes: `pnpm package:size`
- Package exports: `pnpm package:quality`
- Major metadata: `ALLOW_MAJOR_RELEASE=1 pnpm changeset:check`
