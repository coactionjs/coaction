# Size budgets

`pnpm package:size` measures the gzipped size of every published entry against
`package-size-budgets.json`, and the size of a consumer bundle built from the
core entries against `core-entry-size-budgets.json`.

Each entry has two numbers. `baselineGzipBytes` is what it measured at the last
deliberate freeze; `maxGzipBytes` is the ceiling that fails the build. The
report prints the delta from the baseline whether or not the ceiling is
breached, so drift is visible before it is a failure.

## Frozen at 4.0.0

Every baseline in both files was set from the 4.0.0 release build, with ceilings
about eight per cent above. Before that they had been moved one entry at a time
as work landed, which let the core entry drift more than a kilobyte under its
ceiling without anything saying so — the report showed it, and the build stayed
green, and nobody looked.

## Moving a baseline

A baseline moves when the size it records is no longer what the code is. That is
a deliberate act with a reason, stated where the reason belongs:

- **Say what was added.** A number that moves without an explanation in the same
  commit is indistinguishable from one that moved to silence a failure.
- **Check what grew.** Runtime bundles retain legal notices and tree-shaking
  annotations. API JSDoc stays in declarations instead of being duplicated in
  JavaScript. This packaging change reduces the raw artifact measurements
  without changing the frozen ceilings. The core consumer fixtures measure
  retained Coaction code with `alien-signals`, `data-transport` and `mutative`
  externalized; they are not dependency-inclusive application bundle sizes.
- **Never move a ceiling to pass a build.** Raising `maxGzipBytes` without
  raising `baselineGzipBytes` hides the growth from the report as well as from
  the build.

Between releases, growth is expected to be small and explained. At a release,
the baselines are frozen again from the release build.

## Final 4.0 correctness qualification

The final correctness audit added complete producer-patch certification, cached
computed failures, and ordered commit delivery that survives observer errors and
reentrant writes. Bounded read sets can compare observed paths directly when no
patch consumer needs a journal. This recovers reader-write throughput while
retaining full certification whenever patches are consumed.

The default core consumer measures **10,945 bytes gzip**, compared with the
earlier baseline of 9,817 bytes and ceiling of 10,650. The shared consumer, which
contains the same mutation runtime, measures **15,142 bytes**, compared with its
13,971-byte baseline and 15,100-byte ceiling. These corrections exceed the old
ceilings by 295 and 42 bytes respectively. The new baselines record both costs
explicitly; the **11,200- and 15,500-byte ceilings** leave 255 and 358 bytes of
headroom.

This is a deliberate final release freeze for these correctness contracts. The
other entry budgets and all performance floors retain their existing limits.
Single scalar replacements use a direct certificate, while compound and non-tree
transitions retain full replay/snapshot verification. Consumer fixtures and
externalized dependencies are unchanged, so these are comparable measurements.

## Node-addressed read tracking

A tracked read now records the trie node its proxy already holds, deduplicated
by a collection stamp, and signal links are established once per surviving
dependency when the collection ends. The old path arrays, root-to-leaf trie
walks and per-read map updates are gone; the stamped collection, its reconcile
pass and node re-resolution after pruning replace them.

Against the 4.1.0 build, that costs **341 bytes** in the default core consumer
(11,340), **347 bytes** in the shared consumer (15,559) and **357 bytes** in the
derived consumer (2,689), which carries the same collection runtime. The
`coaction/derived` artifacts record it as 4,025 and 4,426 bytes. Each baseline
moved with its ceiling, so the headroom is the same as at the 4.0 freeze.

## Array values and whole-array scans

Array elements leave the public state as frozen values, and the read-only array
methods scan the array itself under one dependency. That adds the element
freeze, the getter mapping for values held inside arrays, and one cached
wrapper per scanned method: **441 bytes** in the default core consumer (11,781)
and **442 bytes** in the shared consumer (16,001). The derived consumer does
not contain the proxy layer and is unchanged. Both baselines moved with their
ceilings.

## Recipe-read certification

A store that consumes patches certified a single scalar write by comparing every
element of each array along its path. The recipe's mark now records the objects
it reads, and a write whose recipe read nothing beside its own path skips that
comparison. The recording mark and the path check cost **166 bytes** in the
default core consumer and **154 bytes** in the shared consumer. The fixes and
optimisations that followed the array-values freeze had already added 206 and
217 bytes inside the ceilings, so the baselines now record the measured 12,153
and 16,372 bytes. Both moved with their ceilings.

## Root writes without a draft

A recipe that only writes values to the root's own keys -- `count += 1` -- no
longer creates and finalizes a Mutative draft: the root starts as a plain copy,
and any other access hands it to the draft, with the writes so far replayed.
That costs **380 bytes** in the default core consumer and **375 bytes** in the
shared consumer. The faster state copy before it had added 78 and 72 bytes
inside the ceilings, so the baselines now record the measured 12,611 and 16,819
bytes. Both moved with their ceilings.

## Initial state from the store's own root

`getInitialState()` reads a native store's first root, with the factory's own
methods and accessors, instead of keeping the factory's object and all of its
data alive beside the store's copy. The reader costs **231 bytes** in the
default core consumer and **232 bytes** in the shared consumer; freezing values
as they are copied in and skipping the kept-keys shape check had added 150 and
147 bytes inside the ceilings. The baselines now record the measured 12,992 and
17,198 bytes and moved with their ceilings.

The published `dist/index` files carry every entry point's code, so they record
all of the work above since their own baselines: 19,642 and 19,749 bytes. They
moved with their ceilings too.

## Element comparison

A local write that needs no patch pair compares the two arrays element by
element below an array most of whose elements are tracked, instead of looking up
the element of every tracked node: rows of a list that each read their own
element made a write take a step per row. The comparison, the copy of a frozen
array it reads, and the count of index-keyed children each trie node keeps cost
**279 bytes** in the default core consumer and **265 bytes** in the shared
consumer. The work since the initial-state reader had added 111 and 116 bytes
inside the ceilings, so the baselines now record the measured 13,382 and 17,579
bytes and moved with their ceilings.

The derived consumer only creates and prunes trie nodes, so it takes the count
and the index check, 90 bytes, inside its ceiling. The index check is a module
of its own so that taking it does not bring in the rest of the state utilities,
and `mutative` with them.
