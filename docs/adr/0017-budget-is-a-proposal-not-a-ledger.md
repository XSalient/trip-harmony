# 0017. Budget is a proposal type, not an expense ledger

- Status: Accepted
- Date: 2026-08-22

## Context

Dates, Suggestions and Accommodations are one shape: propose, vote, an admin
finalises. Budget was an append-only journal — `budget_items`, newest first,
with a category, an amount and who paid.

It answered a question nobody had asked yet. The trips in this app have not
happened; there is nothing to expense. And it could not hold the question the
group actually argues about, which is _how much are we spending_. There was
nowhere to say "£1,200 a family" and nowhere for anyone to disagree.

Its one derived figure was also wrong for families: the per-person split divided
the total by member count, so a family of four that logged one expense counted
as one person.

## Decision

`budget_items` is dropped. Budget becomes a proposal type: `budget_proposals`
and `budget_votes`, shaped after `destinations` / `destination_votes`, served by
a `budget.ts` router that follows `destinations.ts` procedure for procedure.

A proposal carries a **scope** — `trip_total`, `per_person`, `per_adult` or
`per_group` — saying what its amount means. Every card shows both the figure as
written and its normalised trip total, because two proposals in different units
cannot be compared until one has been converted, and the reader should not be
the thing converting them.

**Exactly one budget is finalised at a time.** Budget follows dates, not places:
a trip has several destinations and several places to sleep, but one answer to
"how much". `setBudgetLock` clears the trip before setting one row.

The arithmetic lives in `shared/budget.ts`, imported by the server, the screen
and the referee prompt, so the three cannot disagree about what a family owes.

Personal caps stay and gain a group-level counterpart. The screen reports **how
many** voters are over their cap against the leading proposal — never who, never
by how much, and never to a watcher.

## Consequences

- One section shape across the whole app: comments, "x/y voted", the vote score,
  finalise attribution and the activity trail all work on a budget with no
  special case, because `proposal_type` gained `budget` and everything
  polymorphic followed.
- **Dropping `budget_items` is destructive and irreversible.** Migration
  `0011_drop_budget_items.sql` is deliberately the last one and the only thing
  in it, so it can be held back for a release while the rest lands. Existing
  rows go with it.
- The AI Referee's budget facts change from logged spend to proposals, their
  normalised totals, what is finalised, and the tightest cap. `loggedTotal` and
  `loggedPerPerson` are gone.
- Actual spend is no longer tracked anywhere. If the group wants "what did we
  spend" back, it is a new section with its own story — not a tab on this one,
  and not this table restored.
- Headcount becomes load-bearing: a per-person budget divides by
  `getTripHeadcount`, so a trip with no attendees would divide by zero.
  `shared/budget.ts` returns 0 rather than `NaN` for every such case, and is
  unit-tested for it, because `NaN` renders as "NaN" across the whole section
  while looking like working code.
