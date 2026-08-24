# Planning features — August 2026

Four epics, from one round of feedback. This file is the map; the specification
lives in [stories/](stories/) and the state lives in [progress.md](progress.md).

## Why these are one programme

Each is a different half of the same complaint: **something a person states
privately never becomes something the group can decide on.**

- A budget written in My Preferences reaches AI match scoring and nothing else.
- A person with no opinion has no way to say so, so they say nothing — and the
  count that everybody is waiting on stalls on somebody who does not care.
- The household somebody is in can only be recorded by an admin, and the members
  page would not let anybody record their own.
- The address book knows people but not families, so the same five get typed in
  for every trip.

The groups-and-budget programme (E9–E12) built the machinery — groups, headcount,
one vote per family, budget as a proposal. This is the part that lets people
reach it.

## The decisions

Taken with the trip owner before scoping. They close the obvious alternatives;
do not relitigate them mid-build.

| Question                                    | Decision                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A preference that states a budget or a date | **Detect, then confirm.** Nothing reaches the group without a tap.                             |
| Every cast vote is "go with the majority"   | **Finalising is refused**, server-side, on all four proposal types.                            |
| Who may organise groups                     | A tripmate creates, joins and leaves, and manages the group they are in. Admin keeps the rest. |
| A contact group clashing with a trip group  | Return the conflicts and change nothing; on confirmation, move them and reconcile the votes.   |

Two departures from what was asked for, each argued in its ADR:

- **"Go with the majority" is an abstention, not a proxy vote** — never folded
  into the Yes/Maybe/No counts ([ADR 0018](../adr/0018-going-with-the-majority-is-an-abstention.md)).
- **Places are not detected from preference text**, only budgets and dates
  ([ADR 0020](../adr/0020-preferences-suggest-proposals.md)).

Drag-and-drop was very nearly a third. It was scoped as chips-instead-of-drag on
the grounds that drag is unreliable on a phone; that was wrong — it is the HTML5
drag API that does not work on touch, not drag as an interaction — and it now
ships as asked, with the chips kept underneath it as the keyboard path
([ADR 0019](../adr/0019-groups-are-self-service.md)).

## The epics

| Epic                                                                              | Weight |
| --------------------------------------------------------------------------------- | ------ |
| [E13 — Going with the majority](stories/E13-going-with-the-majority.md)           | M      |
| [E14 — Groups are self-service](stories/E14-groups-are-self-service.md)           | M      |
| [E15 — Contact-book groups](stories/E15-contact-book-groups.md)                   | L      |
| [E16 — Preferences become proposals](stories/E16-preferences-become-proposals.md) | L      |

## Delivery order

**E13 → E14 → E15 → E16.** E15 needs E14's assignment rules and its reconcile
helper; the other two are independent, and E13 goes first because it is the one
carrying a migration whose constraints are worth verifying alone.

## Users

| User         | What changes for them                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Admin**    | Cannot finalise a proposal everybody abstained on. Can finally put themselves in a group. Imports families as tripmates. |
| **Tripmate** | Can say "I don't mind". Creates and joins groups, manages their own. Saves and imports families, as watchers.            |
| **Watcher**  | Nothing. No caps, no ages, no vote authorship, no suggestions — asserted on the payloads.                                |

## Verification

`pnpm verify` after each step, and the migrations applied `0000`→`0014` in order
to a scratch Postgres 16 with the result diffed against `drizzle-kit push`. The
end-to-end walk is in each story file's test script.
