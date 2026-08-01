# Architecture Decision Records

Short documents recording decisions that would otherwise be re-litigated every
few months. Each one captures the context, the choice, and what it costs.

**Append-only.** To reverse a decision, add a new ADR that supersedes the old one
and mark the old one superseded — never rewrite history.

Write one when a change affects how the system is structured, deployed, secured
or operated. Skip it for routine feature work.

| #                                             | Decision                                         | Status   |
| --------------------------------------------- | ------------------------------------------------ | -------- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions                    | Accepted |
| [0002](0002-modular-monolith.md)              | Modular monolith with tRPC, not services         | Accepted |
| [0003](0003-doppler-for-secrets.md)           | Doppler as the source of truth for secrets       | Accepted |
| [0004](0004-structured-logging.md)            | Structured JSON logging with request correlation | Accepted |
| [0005](0005-domain-split-routers.md)          | One router file per domain                       | Accepted |
| [0006](0006-validated-config-at-boot.md)      | Validate configuration at boot, fail fast        | Accepted |
| [0007](0007-passkeys-for-sign-in.md)          | Passkeys as a first-class sign-in method         | Accepted |

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
