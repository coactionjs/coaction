# Threading and Authority Model

Coaction shared stores use one write authority and any number of client
mirrors. This model is the same for Worker, SharedWorker, and custom transports.

## Modes

| Mode          | `store.share` | Mutation authority | Method calls                      |
| ------------- | ------------- | ------------------ | --------------------------------- |
| Local         | `false`       | Current runtime    | Synchronous                       |
| Shared main   | `'main'`      | Main runtime       | Synchronous on the main runtime   |
| Shared client | `'client'`    | Main runtime       | Promise-returning transport calls |

A client can read and subscribe to its mirrored state. It cannot call
`setState()` or `apply()` directly.

## Shared data contract

Every value crossing the shared boundary is encoded as a JSON string. Shared
state, action arguments, non-void action results, full snapshots, and patch
values must form a JSON tree:

- `null`, booleans, strings, and finite numbers other than negative zero;
- dense arrays containing JSON values;
- plain records with safe string keys and JSON values.

Unsupported values are rejected before serialization. This includes
`undefined`, `BigInt`, `NaN`, infinities, functions used as data, symbols,
accessors, sparse arrays, custom platform objects, cycles, and repeated object
references. Store methods and computed getters are runtime behavior and are not
part of transported state.

The transport protocol accepts only its versioned message shapes. Malformed
messages, unsafe action paths, unsafe patch paths, invalid epochs, and invalid
sequence numbers fail closed.

## Updates and recovery

Each main-store lifetime owns an epoch. Its sequence starts at zero and advances
when it emits a patch update. A client:

1. obtains an atomic `{ epoch, sequence, state }` snapshot on connection;
2. applies only the next sequence for its current epoch;
3. ignores duplicate or older updates;
4. requests a full snapshot after a sequence gap or epoch change.

State replacement is atomic: if applying a snapshot or update fails, the client
keeps its previous epoch, sequence, and state.

## Remote actions

Only method paths discovered from the main store can execute remotely.
`transportPolicy` can narrow that surface further:

- `allowedActions` is an allowlist of method paths;
- `authorize` accepts or rejects a decoded execute or full-sync request;
- `mapError` may convert an action failure into a deliberately public message.

Unexpected action failures are returned as `Remote action failed`. The original
error remains on the authority unless `mapError` returns a non-empty safe
string.

An action response includes the authority epoch and resulting sequence. The
client waits for its mirror to reach that point, then falls back to full sync
after `executeSyncTimeoutMs`.

If the authority changes while an action is in flight and the response belongs
to the old authority, the promise rejects with
`ActionAuthorityChangedError`. Its `outcome` is `unknown`: the previous
authority may already have performed the action. Retry only when the action is
idempotent or protected by application-level deduplication.

## Lifecycle

Destroying a main or client store removes transport listeners and rejects or
releases pending work. Reconnect callbacks from an older connection generation
cannot overwrite state established by a newer connection.

An authority and all clients connected to it must use the same Coaction major
and wire protocol. See the
[2.x to 3.x migration guide](../features/json-only-shared-runtime/migration.md)
for coordinated Worker and SharedWorker upgrades.
