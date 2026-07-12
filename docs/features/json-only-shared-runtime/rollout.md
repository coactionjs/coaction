---
type: rollout
title: JSON-only shared runtime rollout
description: Migration, release gates, rollback, and archive policy for replacing the legacy mixed runtime.
owner: unadlib
status: proposed
risk_level: critical
tags: [core, rollout, migration, release]
---

## Archive strategy

The complete pre-refactor implementation remains available on
`archive/full-hardening-before-json-main-20260712`. The new `main` starts from
the published baseline so that each retained security and concurrency behavior
is deliberately reintroduced under the JSON-only contract.

The archive is evidence and a source for focused ports; it is not a release
branch and MUST NOT be merged wholesale into the new main line.

## Migration stages

1. Establish the JSON codec, protocol types, and focused tests without changing
   the public release.
2. Port authorization, epoch, sequencing, reconnect, and cleanup guarantees.
3. Add static local/shared/adapter entry points and consumer size budgets.
4. Migrate official packages and examples to the appropriate entry points.
5. Remove legacy rich-state and dynamic-mode dependencies from the default
   runtime.
6. Add major changesets and user migration documentation.
7. Run the complete package, peer, integration, browser, release, and size gates.

Current progress:

| Stage                                      | Status   | Evidence                                                                     |
| ------------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| JSON codec and protocol                    | Complete | Focused codec/protocol tests in `packages/core/test`                         |
| Authority, convergence, reconnect, cleanup | Complete | Core fake-transport and worker tests                                         |
| Static entries and consumer budgets        | Complete | `coaction/local`, `coaction/shared`, `coaction/adapter`; `pnpm package:size` |
| Official package migration                 | Complete | Adapter sources import `coaction/adapter`; 17-package test matrix passes     |
| Migration and major release metadata       | Complete | Migration guide and 17-package major changeset validate successfully         |
| Final release gates                        | Complete | Full check, coverage, browser matrix, package quality, and size gates pass   |

## Release gates

- No known authorization, convergence, lifecycle, or package-entry defect.
- Every contract rule in the test plan has direct evidence.
- Local and shared production consumer bundles meet separately reviewed budgets.
- Non-JSON behavior is either explicitly local/opt-in or documented as removed.
- Major-version migration guidance is complete.
- Human review approves the trust boundary, sequence state machine, and size
  trade-offs.

## Rollback

Before publication, rollback means resetting the candidate branch to the last
known-good new-main commit; the archive remains untouched. After publication,
rollback means deprecating the affected major version and directing users to the
last supported 2.x release while a corrected major is prepared. The archived
branch is not published as an emergency replacement.

## Verification

- Archive branch existence is verified with `git branch --list`.
- Runtime and package matrix: `pnpm exec turbo run test --force`.
- Static bundle isolation and budgets: `pnpm package:size`.
- Package export validity: `pnpm package:quality`.
- Full release matrix: `pnpm check`.
- Coverage: `pnpm test:coverage` (59 files, 617 tests; 94.35% statements and
  88.37% branches).
- Browser workers: `pnpm test:e2e:browser` (27 tests across Chromium, Firefox,
  and WebKit).
- Release metadata: `ALLOW_MAJOR_RELEASE=1 pnpm changeset:check`.
