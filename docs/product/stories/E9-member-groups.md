# E9 — Member groups

- **Covers request items:** 17, 18
- **Status:** Not started
- **Depends on:** E2 (the role model this gates against)

## Why

A trip of families is not a flat list of voters. Two adults from one household
have one opinion and one wallet, but the app gives them two of each. There is no
way to say "these three people are the Patels", so nothing downstream — voting,
budget, headcount — can treat them as one.

## The rule

A member belongs to **at most one group**. A member in no group is a group of
one: **ungrouped is a first-class state, not an error and not a missing value.**
Nobody is auto-assigned to a singleton group — that doubles the rows and makes
the members page unreadable for the trips that never wanted groups.

Creating, renaming, deleting a group and moving members between them are **admin**
actions. Setting a group's spending cap is admin, or a tripmate in that group.

## Stories

### E9.1 — As an admin, I can group members into families, so the trip is organised the way the people on it are

**Acceptance criteria**

- [ ] I can create a group with a name, rename it, and delete it.
- [ ] I can move any member into a group, into a different group, or out of all
      of them.
- [ ] A member in no group is shown as ungrouped and is never auto-assigned.
- [ ] Deleting a group leaves every one of its members on the trip, ungrouped.
      It never removes a member.
- [ ] Group names are unique per trip, case-insensitively; a duplicate returns
      `CONFLICT` with a message a person can act on.
- [ ] A tripmate sees the grouping read-only. A watcher sees group names and
      membership, and **no `budgetMax` on any group or member** — asserted on
      the payload, not on the rendering.
- [ ] Cloning a trip clones its groups and each member's group. Deleting a trip
      removes its groups.

**Touches**

- `drizzle/schema.ts` — new `trip_groups` table (`id, tripId, name, budgetMax,
createdAt`) and `tripMembers.groupId` (nullable, `drizzle/schema.ts:150-166`).
- `drizzle/0008_member_groups.sql` — new migration, hand-written. Carries the
  case-insensitive unique index on `(tripId, lower(name))`, which Drizzle cannot
  express — the same situation as `trip_invites`, documented at
  `drizzle/schema.ts:171-177`. RLS on with no grants, per
  [ADR 0009](../../adr/0009-rls-on-with-no-policies.md).
- `server/routers/groups.ts` — **new domain file**, plus one line in
  `server/routers/index.ts`. AGENTS.md rule 4: a new domain gets a new file.
- `server/db.ts` — `getTripGroups`, `createTripGroup`, `updateTripGroup`,
  `deleteTripGroup`, `setMemberGroup`. Add `trip_groups` to the clone table set
  (`server/db.ts:433`) and the delete cascade (`:494`), beside the existing
  member helpers (`addTripMember` `:501`, `getTripMembers` `:546`).
- `server/routers/_shared.ts:182-199` (`projectMembersForRole`) — carry `groupId`
  and the group's name for every role; keep both caps behind
  `canSeeMemberDetails`.
- `client/src/pages/TripMembers.tsx` — members render grouped, with a plain
  "Not in a group" heading for the rest; admin gets create / rename / delete and
  a per-member group picker.
- `client/src/_core/hooks/useTripRole.ts` — expose `myGroupId` / `myGroupName`.

**Notes**

A cap is a personal figure and it is the exact field E2 recorded finding late:
`budget.summary` was returning every member's `budgetMax` to anyone who asked,
because the audit had been done per router file rather than per payload. There
are now two caps to leak instead of one. Project at the router boundary
(AGENTS.md rule 5).

New activity verbs in `ACTIVITY_ACTIONS` (`server/db.ts:884-905`):
`group.created`, `group.renamed`, `group.deleted`, `group.member_assigned`.

### E9.2 — As an admin, I choose whether this trip votes per person or per family

**Acceptance criteria**

- [ ] `trips.votingUnit` is `member` (default) or `group`, and only an admin can
      change it.
- [ ] The setting lives on the members page beside the group list — not in the
      trip edit dialog.
- [ ] Changing it explains what will happen to votes already cast (E11 defines
      it: nothing retroactive).
- [ ] A trip that never creates a group behaves exactly as it does today,
      whatever the setting says.

**Touches**

- `drizzle/schema.ts:127-141` — `trips.votingUnit`, new `voting_unit` enum.
- `server/routers/groups.ts` — `setVotingUnit` (admin).
- `client/src/pages/TripMembers.tsx` — the switch.

**Notes**

It sits on the members page because it is a statement about the people, and
because that is the only screen where its effect is visible. The trip edit dialog
is about the trip's name, dates and currency.

## Open questions

None.

## Out of scope

- Groups that persist across trips, or are shared between them.
- Group-level invites — inviting one person and having their family follow.
- More than one group per member.
