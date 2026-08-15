# Architecture Decision Records

Short documents recording decisions that would otherwise be re-litigated every
few months. Each one captures the context, the choice, and what it costs.

**Append-only.** To reverse a decision, add a new ADR that supersedes the old one
and mark the old one superseded — never rewrite history.

Write one when a change affects how the system is structured, deployed, secured
or operated. Skip it for routine feature work.

| #                                                                | Decision                                              | Status   |
| ---------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)                    | Record architecture decisions                         | Accepted |
| [0002](0002-modular-monolith.md)                                 | Modular monolith with tRPC, not services              | Accepted |
| [0003](0003-doppler-for-secrets.md)                              | Doppler as the source of truth for secrets            | Accepted |
| [0004](0004-structured-logging.md)                               | Structured JSON logging with request correlation      | Accepted |
| [0005](0005-domain-split-routers.md)                             | One router file per domain                            | Accepted |
| [0006](0006-validated-config-at-boot.md)                         | Validate configuration at boot, fail fast             | Accepted |
| [0007](0007-passkeys-for-sign-in.md)                             | Passkeys as a first-class sign-in method              | Accepted |
| [0008](0008-listing-import-degrades-instead-of-evading.md)       | Listing import degrades instead of evading            | Accepted |
| [0009](0009-rls-on-with-no-policies.md)                          | RLS on with no policies, and no grants for anon       | Accepted |
| [0010](0010-migrations-apply-on-deploy.md)                       | Migrations apply during the deploy                    | Accepted |
| [0011](0011-affected-tests-from-the-import-graph.md)             | Test selection comes from the import graph            | Accepted |
| [0012](0012-session-pooler-for-the-database-url.md)              | `DATABASE_URL` points at the session pooler           | Accepted |
| [0013](0013-optional-scraper-fallback-for-blocked-listings.md)   | An optional scraper fallback for blocked listings     | Accepted |
| [0014](0014-scraper-vendor-identity-comes-from-configuration.md) | A scraper vendor is whatever configuration says it is | Accepted |
| [0015](0015-demo-data-lives-in-its-own-namespace.md)             | Demo data lives in its own namespace                  | Accepted |
| [0016](0016-one-vote-per-group.md)                               | One vote per group is enforced when a vote is written | Accepted |
| [0017](0017-budget-is-a-proposal-not-a-ledger.md)                | Budget is a proposal type, not an expense ledger      | Accepted |
| [0018](0018-going-with-the-majority-is-an-abstention.md)         | "Go with the majority" is an abstention               | Accepted |
| [0019](0019-groups-are-self-service.md)                          | Grouping is a tripmate's job                          | Accepted |
| [0020](0020-preferences-suggest-proposals.md)                    | A preference is offered as a proposal, never made one | Accepted |
| [0021](0021-optimistic-updates-for-drag-and-drop.md)             | A dragged member moves on the drop                    | Accepted |
| [0022](0022-membership-is-read-once-per-request.md)              | A membership is read once per request                 | Accepted |
| [0023](0023-preview-and-production-share-one-database.md)        | Preview and production share one database             | Accepted |
| [0024](0024-first-party-product-measurement.md)                  | First-party product measurement, in its own table     | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by ADR-NNNN
- Date: YYYY-MM-DD

## Context

What forced a decision. Constraints and pressures, not the solution.

## Decision

What we're doing, in the active voice.

## Consequences

What this buys, what it costs, and what becomes harder. Be honest about the
downsides — that is the part future readers need.
```
