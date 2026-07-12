---
type: adr
title: ADR-0001 — JSON-only shared runtime
description: Why Coaction limits shared transport data to JSON trees and separates optional runtime capabilities from the default core.
owner: unadlib
status: accepted
risk_level: critical
tags: [core, transport, json, bundle-size]
---

## Context

Coaction combines local state, shared-main authority, client mirrors, mutable
adapters, and middleware hooks behind one `create()` implementation. Expanding
that implementation to preserve arbitrary platform objects, reference graphs,
binary view metadata, and adapter snapshots made local and shared users pay for
capabilities they did not select.

Shared transport already relies on JSON serialization. Rich platform values and
reference identity do not survive that boundary consistently, so preserving
them inside the default shared runtime creates an internally inconsistent
contract and prevents a small default bundle.

## Decision

Coaction shared transport MUST use a JSON-tree data contract.

- Shared state, action arguments, action results, request context, full-sync
  state, and patch values MUST be JSON values.
- Shared protocol messages MUST cross the transport boundary as encoded JSON,
  not caller-owned JavaScript objects.
- Shared state MUST be a tree. Circular and repeated object references are not
  part of the contract.
- The authority MUST own mutation, epoch, and sequence advancement. Clients are
  mirrors and MUST recover sequence gaps through full sync.
- Authorization, action-path validation, unsafe patch-path rejection, lifecycle
  cleanup, and malformed-message handling remain production guarantees.
- Rich built-in values, binary buffers, mutable-adapter internals, and graph
  topology preservation MUST NOT be unconditional dependencies of the default
  runtime.
- Store modes and optional integrations SHOULD use static entry points so
  bundlers can exclude unselected capabilities.

The exact JSON schema and public types remain code-owned. The durable behavior
and verification requirements live in the related
[feature specification](../features/json-only-shared-runtime/spec.md).

## Options considered

### Keep the exhaustive rich-state runtime

Rejected for the default core. It can provide precise local semantics, but it
does not match the JSON-only shared boundary and imposes a large unconditional
bundle and maintenance cost.

### Disable validation in production

Rejected. Authorization, protocol validation, unsafe-path rejection, and
sequence correctness are production security and convergence properties.
Removing them would reduce guarantees rather than remove accidental complexity.

### Keep one dynamic `create()` and only split files

Rejected as the target architecture. Runtime options do not give a bundler a
static boundary, so shared and adapter code remains reachable from local-store
imports even when source files are separate.

### Use JSON-only transport with static capability boundaries

Accepted. This aligns the wire format, state semantics, threat model, and size
model while retaining the concurrency protections that define shared mode.

## Consequences

- The shared contract becomes smaller and easier to reason about.
- Non-JSON state requires a local-only or explicit extension contract.
- Local, shared, and adapter consumers can have independent bundle budgets.
- Existing callers that rely on implicit non-JSON transport behavior require a
  major-version migration.
- Some defensive code and tests for rich platform values will be deleted or
  moved rather than optimized in place.

## Risks

- An incomplete migration could leave the legacy dynamic path reachable from a
  supposedly lean entry point.
- JSON normalization can silently change values unless unsupported values are
  rejected before encoding.
- Simplifying reconnect logic must not reintroduce lost-update or stale-authority
  races.
- Adapter packages may accidentally depend on private core implementation if a
  stable adapter boundary is not provided.

## Follow-up

- Implement and verify the JSON-only shared-runtime specification.
- Establish independent consumer-bundle budgets for local, shared, and adapter
  entry points.
- Publish the contract change only through a major release with migration notes.

## Verification

- Behavioral verification is defined by the
  [test plan](../features/json-only-shared-runtime/test-plan.md).
- Compatibility and rollback gates are defined by the
  [rollout plan](../features/json-only-shared-runtime/rollout.md).
- Human review MUST confirm that no production authorization or convergence
  invariant was removed solely for size reduction.
