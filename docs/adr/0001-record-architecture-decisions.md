# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-08-01

## Context

This project has already changed hosts (Replit, Manus) and data stores
(MySQL/TiDB → PostgreSQL). Each move left behind documentation describing a
world that no longer exists, and nothing explaining _why_ the move happened.
Four root-level deployment guides contradicted each other by the time this ADR
was written.

The project is also worked on by AI agents, which have no institutional memory at
all. An agent that cannot find the reasoning behind a design will re-derive it —
often differently, and often wrongly.

## Decision

Record architecturally significant decisions as numbered files in `docs/adr/`.
Each records context, decision and consequences. ADRs are append-only: a
reversal is a new ADR that supersedes the old one.

A decision is architecturally significant if it is expensive to reverse, or if a
newcomer would reasonably ask "why is it like this?".

## Consequences

- Anyone — human or agent — can answer "why" without archaeology in git history.
- Superseded reasoning stays visible, so we don't re-tread rejected options.
- Small ongoing cost: a page of writing per significant decision.
- Risk: ADRs that stop being written are worse than none, because the gap is
  invisible. `AGENTS.md` therefore makes writing one an explicit rule.
