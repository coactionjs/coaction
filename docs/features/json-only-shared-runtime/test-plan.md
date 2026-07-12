---
type: test-plan
title: JSON-only shared runtime test plan
description: Required evidence for JSON validation, transport authorization, convergence, lifecycle safety, and bundle isolation.
owner: unadlib
status: proposed
risk_level: critical
tags: [core, testing, json, concurrency]
---

## Required coverage

| Area              | Required evidence                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON acceptance   | Primitives, dense arrays, nested plain records, null, and safe numeric boundaries round trip exactly.                                                                                                     |
| JSON rejection    | Undefined, BigInt, non-finite numbers, negative zero, functions, symbols, accessors, custom `toJSON`, sparse arrays, unsafe keys, cycles, repeated references, and platform objects fail before encoding. |
| Protocol          | Unknown versions/types, malformed JSON, invalid fields, invalid epochs/sequences, and unsafe patch operations fail closed.                                                                                |
| Authorization     | Unknown actions and denied requests never execute; allowed sync and async actions return JSON results and errors through distinct tagged variants.                                                        |
| Convergence       | Contiguous updates apply once; duplicates are ignored; gaps, stale epochs, reconnects, and stale full-sync responses recover without rollback or lost updates.                                            |
| Lifecycle         | Failed setup, reentrant destroy, listener failure, rejected emit, and pending action cleanup leave no active listener or waiter.                                                                          |
| Static boundaries | Local consumer bundles exclude shared and adapter runtime code; shared bundles exclude adapter internals.                                                                                                 |
| Compatibility     | Framework bindings and supported peer versions continue to build against their declared entry point.                                                                                                      |

## Test layers

- Focused core unit tests for codec, protocol, patch, and lifecycle invariants.
- Deterministic fake-transport tests for race ordering and reconnect behavior.
- Worker and SharedWorker browser tests for real structured execution and
  reconnect behavior.
- Package quality checks for ESM, CJS, declarations, and subpath exports.
- Consumer bundle fixtures that measure production minified gzip per entry.
- Full monorepo tests for adapters, middlewares, Yjs, examples, and peers.

## Completion gate

The feature is not complete until all required cases have named tests, the full
repository gate passes without stale rich-state expectations, and the consumer
size budgets prove static isolation.

## Human review

Human review MUST confirm that the tests cover the JSON trust boundary,
authority/client race ordering, adapter rollback behavior, protocol-cohort
deployment, and the local/shared bundle-size trade-off. Test counts and
coverage percentages are evidence from a particular run, not durable contract
values, so they belong in CI output rather than this plan.

## Verification

- Core codec, protocol, convergence, authorization, and lifecycle tests:
  `pnpm --filter coaction test`.
- Official adapter and framework matrix:
  `pnpm exec turbo run test --force`.
- Independent production consumer bundles:
  `node scripts/check-core-entry-isolation.mjs`.
- ESM/CJS/declaration exports: `pnpm package:quality`.
- Full release matrix: `pnpm check`.
- Instrumented coverage report: `pnpm test:coverage`.
- Real Worker and SharedWorker transports: `pnpm test:e2e:browser`.
- Major release metadata: `ALLOW_MAJOR_RELEASE=1 pnpm changeset:check`.
