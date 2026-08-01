# 0005. One router file per domain

- Status: Accepted
- Date: 2026-08-01

## Context

The entire API lived in `server/routers.ts` — 1,182 lines covering authentication,
trips, dates, destinations, accommodations, budget, AI mediation, notifications,
comments, preferences, the vibe board and the itinerary.

Two concrete problems:

1. Every change touched the same file, so concurrent work conflicted constantly.
2. An AI agent asked to change budget logic had to load all 1,182 lines to find
   ~70 relevant ones. Repeated across a session, that dominated context and cost.

## Decision

Split into one file per domain under `server/routers/`, each exporting a single
router, composed in `server/routers/index.ts`. Helpers used by more than one
domain live in `_shared.ts`; the AI match analysis pipeline lives in its own
module. Files run 23–228 lines.

`docs/architecture/repo-map.md` maps domains to files so neither a person nor an
agent has to search to find the right one.

## Consequences

- Editing one domain loads roughly 5% of the API surface instead of all of it.
- `index.ts` is a 41-line table of contents that gives the whole API at a glance.
- Conflicts between concurrent changes are now rare.
- More files to navigate — mitigated by the repo map.
- A genuinely cross-cutting change now touches several files. Rare in practice,
  and the compiler catches anything missed.
