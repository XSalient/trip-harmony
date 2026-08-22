# E12 — Budget as a voting section

- **Covers request items:** 22, 23, 24
- **Status:** Not started
- **Depends on:** E9 (a budget can be per group), E10 (per-person needs a
  headcount), E11 (a budget vote is one per group like every other vote)

## Why

Dates, Suggestions and Accommodations are all one shape: propose, vote, an admin
finalises. Budget is an append-only expense journal — `budget_items`, newest
first, no proposal, no vote, no finalise. So the question a group actually argues
about, which is _how much are we spending_, has nowhere to be asked, and the
journal answers a question nobody asked yet: what did we spend, on a trip that
has not happened.

The per-person figure it does compute is also wrong for families. It divides by
member count, so a family of four that logged one expense is treated as one
person.

## The rule

**Budget becomes a proposal type.** A budget proposal is a title, an amount, a
currency, and a **scope** that says what the amount means:

| Scope        | The amount is…                                          |
| ------------ | ------------------------------------------------------- |
| `trip_total` | one figure for the whole trip                           |
| `per_person` | per chargeable head — adults + children                 |
| `per_adult`  | per adult                                               |
| `per_group`  | per group; an ungrouped member counts as a group of one |

Every proposal is shown **both** as its stated figure ("£1,400 per family") and
as a normalised trip total, so proposals written in different units can race.

**Exactly one budget is finalised at a time** — budget follows dates, not places.
Finalising a second un-finalises the first.

**The expense journal is removed.** `budget_items` and its two enums are dropped.

## Stories

### E12.1 — As a tripmate, I propose a budget and we vote on it like anything else

**Acceptance criteria**

- [ ] I can propose a budget with a title, amount, currency and one of the four
      scopes, and it appears with my Yes already counted.
- [ ] Voting, unvoting, comments, "x/y voted", the vote score and its
      explanation dialog behave exactly as they do on Suggestions — including
      one vote per group (E11).
- [ ] An admin can finalise a budget; finalising a second un-finalises the
      first; a tripmate and a watcher cannot finalise.
- [ ] A locked budget cannot be edited or deleted (the E6.1 rule).
- [ ] Only the proposer or an admin can edit or delete an unlocked one.
- [ ] A watcher's `budget.list` payload carries no proposer, no vote authorship,
      no caps and no over-cap count.

**Touches**

- `drizzle/schema.ts` — `budget_scope` and `budget_vote` enums;
  `budget_proposals` (`id, tripId, proposedBy, title, amount, currency, scope,
covers, selected, lockedBy, lockedAt, createdAt`) and `budget_votes`
  (`proposalId, userId, vote, createdAt, updatedAt`) — the same shape as
  `destinations` / `destination_votes` (`drizzle/schema.ts:296-336`).
- `proposalTypeEnum` (`drizzle/schema.ts:12-16`) gains `"budget"`, so
  `proposal_comments`, `comments.list` and `comments.voters`
  (`server/routers/comments.ts:25,55,66`) serve budget with no new code.
- `server/routers/budget.ts` — rewritten to the shape of
  `server/routers/destinations.ts`: `list, create, vote, unvote, setLock, edit,
delete, summary`. Copy that file's role checks exactly.
- `server/db.ts` — `setBudgetLock` modelled on `selectDateProposal`
  (`server/db.ts:622-634`), which clears the trip first. **Not** on
  `setDestinationLock`, which does not.
- `client/src/pages/TripBudget.tsx` — rewritten against `TripDestinations.tsx`:
  `ScreenHeader`, `ProposalRow`, `VoteScore`, `VotedCount`, `LockToggle`,
  `FinalisedBy`, `AddedBy`, `ProposalComments`, `useProposalDialogs`.
- `client/src/pages/TripDashboard.tsx:640-660` — Budget moves from
  `CollapsibleRow` to `SectionCard`, with the other three voting sections.
  `"budget"` stays a `SectionKey` in
  `client/src/components/trip/useSectionState.ts`, so collapse state survives.

**Notes**

`budget.list` must go through `projectProposalsForRole`
(`server/routers/_shared.ts:161-176`). Budget was the one section never
projected, and E2 found that the hard way: `budget.summary` was handing every
member's cap to anyone who asked. A new section that skips the projection
repeats it.

Creating a proposal counts as a `love` vote for it and records both activity
rows, exactly as `destinations.create` does
(`server/routers/destinations.ts:50-73`). It also goes through E11's exclusivity
helper, or proposing quietly overrides a groupmate's vote.

### E12.2 — As a family, the amount is expressed in a unit that makes sense and compared fairly

**Acceptance criteria**

- [ ] Every proposal card shows its stated figure and its normalised trip total.
- [ ] On a trip with families, I see **my group's share** of each proposal.
- [ ] A group's share is computed from chargeable heads — adults + children —
      and **pets are never chargeable**.
- [ ] The shares of all groups sum to the trip total.
- [ ] A trip with no attendees renders `0`, never `NaN` or `Infinity`.
- [ ] Proposals sort by vote score, as every other section does.

**Touches**

- **`shared/budget.ts`** — new pure module, unit-tested beside itself:
  `tripTotalOf(amount, scope, headcount)` and
  `groupShareOf(amount, scope, headcount, group)`. Both sides import it, so the
  server, the screen and the referee cannot disagree about the arithmetic.
  Imported as `@shared/budget` on the client (AGENTS.md §5).
- `server/db.ts` — `getTripHeadcount` (E10.2) is its only source of counts.
- `server/routers/budget.ts` — `summary` returns
  `{ finalised, leading, tripTotal, perPerson, perGroup, yourGroupShare,
votersOverCap }`.

**Notes**

Zero headcount is the one that will bite. An empty or brand-new trip divides by
zero and renders the whole section as `NaN` — plausible-looking code, completely
broken screen. It is an explicit acceptance criterion and an explicit unit test.

A child counts as a whole head. Weighted splits are out of scope, and adding
them later is a change to one function.

### E12.3 — As a member, my cap is mine, and the group is told when a budget outgrows it

**Acceptance criteria**

- [ ] A group's cap (`trip_groups.budgetMax`, E9) supersedes the member cap
      (`tripMembers.budgetMax`) for anyone in that group; an ungrouped member
      keeps their own.
- [ ] The cap dialog says which of the two it is setting.
- [ ] The screen shows **how many** voters are over their cap against the
      leading proposal — never who, never by how much.
- [ ] A watcher sees no cap and no over-cap count.
- [ ] Finalising a budget notifies the voters who are over their resolved cap,
      **once**, and nobody else.

**Touches**

- `server/routers/trips.ts` (`updateMemberBudget`) and `server/db.ts:719-728`
  (`updateMemberBudget`) — resolve to the group's cap when the member is in one.
- `server/routers/budget.ts` — the `budget_alert` notification moves from "every
  time an expense is logged" to "once, on finalise".
  `notificationTypeEnum` already has `budget_alert`
  (`drizzle/schema.ts:88-96`); no schema change.
- `server/prompts/referee.ts:94`, `:153-160`, `:280-290` — budget facts become
  `{ currency, proposals: [{ title, tripTotal, score }], finalised, tightestCap,
votersOverCap }`. `loggedTotal` and `loggedPerPerson` go with the journal.

**Notes**

"Three voters are over their cap" is the honest version of the old
`budget_alert`, which fired on every expense and named a figure. A count creates
the pressure to talk without publishing anyone's finances to the group.

The old notification also hardcoded `$` while the trip carried a `currency`
(`server/routers/budget.ts`, the threshold loop). Fix that in passing; the trip's
currency is right there.

### E12.4 — As a developer, the expense journal is removed cleanly

**Acceptance criteria**

- [ ] `budget_items` and the `budget_category` and `split_type` enums are
      dropped, in a migration of their own.
- [ ] No router, page, prompt or test references them.
- [ ] The changelog and `PROJECT_STATUS.md` both carry the destructive-migration
      warning, in the shape used for 0006 and 0007.
- [ ] `roleCoverage.test.ts` is updated for budget's new procedures.

**Touches**

- `drizzle/0011_drop_budget_items.sql` — **destructive and irreversible.** Its
  own migration, shipping last, so it can be held back independently of the rest.
- `server/db.ts:1490-1534` — the five `budgetItem` helpers, deleted; the clone
  and delete sets (`:433`, `:494`) updated.
- `server/routers/roleCoverage.test.ts:80` — budget's entry. The sweep fails
  until it is updated, which is the point of the sweep.
- `docs/CHANGELOG.md`, `docs/PROJECT_STATUS.md`, `docs/ROADMAP.md`,
  `docs/architecture/data-model.md`, `docs/architecture/repo-map.md`.

**Notes**

Rows in `budget_items` go when this applies, exactly as `vibe_items` did with 0006. Take a backup first if anything in production is worth keeping. Shipping it
as the last migration, alone, is what makes "hold it back for a week" possible.

`ALTER TYPE … ADD VALUE` cannot run in the same transaction as a statement using
the new value, so keep `0010_budget_voting.sql` to enum additions and DDL only.

## Test script

Walked against a real Postgres with `pnpm dev`, inspecting **payloads** in the
network tab rather than only the rendering — the standard this directory sets.

1. Admin creates a trip and invites Priya (tripmate), Raj (tripmate), Ann
   (watcher).
2. Admin creates groups "The Patels" (Priya + Raj) and "Ann", stays ungrouped
   themself, and sets the voting unit to **per group**.
3. Priya adds two children (6 and 9) and a dog to The Patels. No age field
   appears for the dog. The summary reads "3 adults · 2 children · 1 pet".
4. Priya votes Yes on a suggestion; Raj votes No on the same one. The proposal
   holds **one** vote — Raj's No — attributed to Raj. Priya's screen shows the
   change on refetch. The count reads "1/3 voted": three voters, and Ann in
   neither number.
5. Propose "£1,400 per family" (`per_group`) and "£350 per person"
   (`per_person`). Both show a normalised trip total. The Patels' share of the
   second reflects four chargeable heads, not five. They sort by vote score.
6. Set The Patels' cap to £1,200. Admin finalises the £1,400 proposal. Priya and
   Raj each get one `budget_alert`; the admin and Ann get none; no screen names
   who is over.
7. Sign in as Ann and inspect `trips.members`, `groups.list`, `attendees.list`
   and `budget.list`: no ages, no caps, no proposer, no vote authorship, no
   over-cap count.
8. Move Raj out of The Patels. Every proposal holds at most one vote per group,
   and the dropped vote appears in the activity trail.
9. Switch back to per-member voting. Existing votes survive; new votes no longer
   collapse.

## Open questions

None.

## Out of scope

- Per-category budgets, currency conversion, and settling up — who owes whom.
- Weighting a child as a fraction of an adult.
- Restoring the expense journal in another form. If actual spend is wanted back
  later, it is a new section with its own story, not a tab on this one.
