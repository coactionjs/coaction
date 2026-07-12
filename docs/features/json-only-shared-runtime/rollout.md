---
type: rollout
title: JSON-only shared runtime rollout
description: Migration, release gates, rollback, and archive policy for replacing the legacy mixed runtime.
owner: unadlib
status: accepted
risk_level: critical
tags: [core, rollout, migration, release]
---

## Archive strategy

The complete pre-refactor experiment remains preserved in the maintainer's
local `archive/full-hardening-before-json-main-20260712` branch at immutable
commit `5390c69fcdd39c0d758e5438c7cb0aa8437e5c9b`. The new `main` starts from the
published baseline so that each retained security and concurrency behavior is
deliberately reintroduced under the JSON-only contract.

The archive is historical evidence and a source for focused ports; it is not a
release branch, is not required for supported rollback, and MUST NOT be merged
wholesale into the new main line. The durable rollback sources are the remote
`v2.1.0` tag and the published 2.1.0 packages.

## Migration stages

1. Establish the JSON codec, protocol types, and focused tests without changing
   the public release.
2. Port authorization, epoch, sequencing, reconnect, and cleanup guarantees.
3. Add static local/shared/adapter entry points and consumer size budgets.
4. Migrate official packages and examples to the appropriate entry points.
5. Remove legacy rich-state and dynamic-mode dependencies from the default
   runtime.
6. Add major changesets and user migration documentation.
7. Document a coordinated protocol cutover for Worker, SharedWorker, and
   injected transports.
8. Run the complete package, peer, integration, browser, release, and size gates.

Implementation progress:

| Stage                                      | Status   | Evidence                                                                               |
| ------------------------------------------ | -------- | -------------------------------------------------------------------------------------- |
| JSON codec and protocol                    | Complete | Focused codec/protocol tests in `packages/core/test`                                   |
| Authority, convergence, reconnect, cleanup | Complete | Core fake-transport and worker tests                                                   |
| Static entries and consumer budgets        | Complete | `coaction/local`, `coaction/shared`, `coaction/adapter`; `pnpm package:size`           |
| Official package migration                 | Complete | Adapter sources import `coaction/adapter`; workspace tests verify consumers            |
| Migration and major release metadata       | Complete | Migration guide and major changesets pass `ALLOW_MAJOR_RELEASE=1 pnpm changeset:check` |
| Coordinated protocol deployment            | Complete | Migration guide covers Worker, SharedWorker, custom transport, and rollback            |
| Release approval                           | Complete | Maintainer review plus the automated release gates listed below                        |

## Release gates

- No unresolved authorization, convergence, lifecycle, or package-entry defect.
- Every contract rule in the test plan has direct evidence.
- Local and shared production consumer bundles meet separately reviewed budgets.
- Non-JSON behavior is either explicitly local/opt-in or documented as removed.
- Major-version migration guidance is complete.
- The release runbook upgrades or rolls back each authority/client cohort as a
  unit; mixed 2.x/3.x traffic is prohibited.
- Human review approves the trust boundary, sequence state machine, and size
  trade-offs.

## Human review

Because this is a critical core-protocol change, a human reviewer MUST approve:

- the JSON validation and remote-action authorization boundary;
- epoch, sequence-gap, reconnect, and teardown race behavior;
- atomic rollback for official mutable adapters;
- the coordinated 2.x/3.x deployment and rollback procedure; and
- the measured local/shared/adapter bundle trade-off.

This acceptance covers the Coaction 3.0 repository contract and release gates.
Each application owner remains responsible for approving its concrete
authority/client cohort inventory, maintenance window, state handoff, and
rollback execution before deployment.

## Rollback

Before publication, rollback means returning the candidate branch to the last
known-good new-main commit; the archive remains untouched. After publication,
rollback means deprecating the affected major version and moving the authority
and all clients in each live transport cohort back to the remote `v2.1.0` tag
and published 2.1.0 packages together while a corrected major is prepared. The
archived branch is not published as an emergency replacement.

## Verification

- Historical snapshot: `git rev-parse archive/full-hardening-before-json-main-20260712`.
- Supported rollback tag: `git ls-remote --tags origin refs/tags/v2.1.0`.
- Runtime and package matrix: `pnpm exec turbo run test --force`.
- Static bundle isolation and budgets: `pnpm package:size`.
- Package export validity: `pnpm package:quality`.
- Full release matrix: `pnpm check`.
- Instrumented coverage report: `pnpm test:coverage`.
- Browser Worker and SharedWorker matrix: `pnpm test:e2e:browser`.
- Release metadata: `ALLOW_MAJOR_RELEASE=1 pnpm changeset:check`.
