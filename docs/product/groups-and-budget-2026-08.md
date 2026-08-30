# Member groups and a budget that is decided — August 2026

Four epics. This file is the map; the specification lives in [stories/](stories/)
and the state lives in [progress.md](progress.md).

## Why this is one programme and not four tickets

The app assumes a trip is a flat list of individual voters. Two real situations
break that assumption, and they break it in the same place.

**A trip of families.** Two adults from one household do not need two votes — the
household has one opinion, and the second vote is really a second chance to argue.
Meanwhile some people on the trip never need an account at all: children, a parent
who will not install anything, a dog. Today the only way to record them is to
invite them as members, which hands them a login, a vote and a notification
stream nobody wanted.

**Budget is not a decision.** Dates, Suggestions and Accommodations are all the
same shape — propose, vote, an admin finalises. Budget is an append-only expense
journal with no proposal, no vote and no finalise, so the question the group
actually argues about ("are we a £1,200-a-family trip or a £2,000-a-family
trip?") has nowhere to be asked. And the per-person figure it does compute is
wrong for families: it divides by member count, so a family of four that logged
one expense is treated as one person.

Both resolve to the same question — **what is the unit of a trip: a person, or a
household?** — and both need the same missing fact: how many people are actually
coming, and who they are. Built as four tickets, each would answer it separately.

## The decisions

Taken with the trip owner before scoping. They close the obvious alternatives;
do not relitigate them mid-build.

| Question             | Decision                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Voting unit          | **A per-trip setting.** `votingUnit = member` (the default, today's behaviour) or `group`. Any tripmate in a group may cast or change it. |
| Budget shape         | **Proposals only.** The expense journal is removed, not kept alongside.                                                                   |
| Budget amount unit   | **Per-proposal scope** — trip total / per adult / per person / per group — normalised so proposals in different units can be compared.    |
| Non-app participants | **Attendees attached to a group** — name, kind (adult/child/pet), age (not asked for a pet). No login, no vote, no notifications.         |

## Terminology

| Product term | In the code                          | Note                                                 |
| ------------ | ------------------------------------ | ---------------------------------------------------- |
| **Group**    | `trip_groups`, `tripMembers.groupId` | A family or household. The UI never says "household" |
| **Attendee** | `trip_attendees`                     | Anyone coming, with or without an account            |
| **Voter**    | derived                              | A group, or an ungrouped tripmate. Never a watcher   |
| **Budget**   | `budget_proposals`, `budget_votes`   | A proposal like any other. `budget_items` is gone    |
| **Cap**      | `budgetMax` on a group or a member   | Personal. Never leaves the server for a watcher      |

## The epics

| Epic                                                                          | Weight |
| ----------------------------------------------------------------------------- | ------ |
| [E9 — Member groups](stories/E9-member-groups.md)                             | L      |
| [E10 — Attendees](stories/E10-attendees.md)                                   | M      |
| [E11 — One vote per group](stories/E11-one-vote-per-group.md)                 | M      |
| [E12 — Budget as a voting section](stories/E12-budget-as-a-voting-section.md) | XL     |

## Delivery order

**E9 → E10 → E11 → E12.** The order is not advisory.

1. **E9 — Member groups.** The container. E11 votes by it and E12 charges by it,
   so it exists first or they invent their own.
2. **E10 — Attendees.** Headcount and ages. Independent of voting, but E12's
   per-person maths divides by a number that does not exist until this ships.
3. **E11 — One vote per group.** Changes tallies on every proposal screen. It
   ships alone, before the new section, so a regression in the vote count is
   attributable to one commit rather than to "the groups work".
4. **E12 — Budget as a voting section.** Last: it is the only epic that needs
   all three of the others, and the only one that drops a table.

## Users

| User                    | What changes for them                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**               | Creates and names groups, assigns members, adds attendees for anyone, sets the voting unit, finalises a budget.                              |
| **Tripmate**            | Sees their group; edits their own group's attendees and cap; casts the group's vote in group mode; proposes and votes on budgets.            |
| **Watcher**             | Sees group names, headcount totals and vote counts. Not ages, not who cast a group's vote, not any cap, not the over-cap count.              |
| **Attendee (no login)** | Exists as a row. Counted in headcount and in per-person budget maths. Never authenticates, never votes, never receives a notification.       |
| **AI Referee**          | Its budget facts change from logged spend to proposals, votes and the tightest cap — `server/prompts/referee.ts:94`, `:153-160`, `:280-290`. |

## Verification

No epic is done until `pnpm verify` passes (typecheck + tests + build) and the
four migrations have been applied in order to a scratch database that already
holds 0000–0007.

Tests follow the patterns already in the repo — no database in the suite:
literal fixtures as in `server/routers/roles.test.ts`, source-reading structural
tests as in `server/routers/locking.test.ts`, and the tRPC caller with a
hand-built context from `server/wevotrip.test.ts:1-52`. Every suite
opens with a comment naming the bug it exists to prevent.

| Suite                                 | Asserts                                                                                                                                        | Epic |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `server/routers/groups.test.ts`       | Group CRUD by role; duplicate name → `CONFLICT`; deleting a group orphans nothing; watcher payload has group names and no caps.                | E9   |
| `server/routers/attendees.test.ts`    | A pet saves with a null age; one attendee row per accepted member, and re-accepting makes no second; watcher payload carries no age.           | E10  |
| `server/db.headcount.test.ts`         | `getTripHeadcount` never counts a pet in `people`; per-group counts sum to the trip's.                                                         | E10  |
| `server/routers/groupVoting.test.ts`  | A second vote in a group replaces the first; ungrouped members unaffected; `votingUnit: "member"` unchanged; a regroup reconciles to one vote. | E11  |
| `shared/budget.test.ts`               | All four scopes; pets never chargeable; zero headcount → 0, not `NaN`; every group's share sums to the trip total.                             | E12  |
| `server/routers/budgetVoting.test.ts` | Proposing counts as a Yes; exactly-one-lock, structurally, as `locking.test.ts` does; a locked budget refuses edit and delete.                 | E12  |
| `server/routers/roleCoverage.test.ts` | Updated for the new routers and budget's new procedures — it fails until they are classified, by design.                                       | E12  |
| `server/prompts/referee.test.ts`      | Budget facts carry proposals and caps, and no logged spend.                                                                                    | E12  |

The manual walkthrough that checks the acceptance criteria end to end — payloads
inspected, not only renderings — is in
[stories/E12-budget-as-a-voting-section.md](stories/E12-budget-as-a-voting-section.md#test-script).

## Risks

1. **Losing the expense journal is irreversible.** `budget_items` rows go with
   migration 0011. It ships alone so it can be held back, and the changelog
   warns exactly as 0006 and 0007 did.
2. **Silent double votes.** A regroup that does not reconcile leaves a family
   with two votes and nothing on screen says so. E11.2 is not optional.
3. **Two denominators.** If the client keeps deriving `memberCount` while the
   server returns `voterCount`, one screen says "2/4" and the next says "2/3".
4. **A pet in a divisor.** The only defence is that one function counts heads
   and one module divides by them, and both are unit-tested for it.
5. **New watcher leaks.** Ages and group caps are the new personal fields.
   Project at the router boundary, never in the page (AGENTS.md rule 5, E2.3).
6. **The default must be inert.** A trip that never creates a group behaves
   exactly as it does today. That is a regression test, not a hope.

## Open questions

None outstanding. The four in the table above were the open questions; they were
answered before scoping.

## Out of scope

- Weighted splits (a child as half a head), per-category budgets, currency
  conversion, and settling up — who owes whom.
- Group-level invites ("invite the Patels"), groups that persist across trips,
  and a voting unit set per proposal rather than per trip.
- Restoring the expense journal in another form.
