# E11 — One vote per group

- **Covers request items:** 21
- **Status:** Not started
- **Depends on:** E9 (there is nothing to vote as until groups exist)

## Why

Two adults from one household get two votes today. That is not a stronger
opinion, it is a second chance to argue — and on a trip of four families it
means the family that brought two adults outvotes the one that brought one.

## The rule

When `trips.votingUnit = "group"`, **a proposal carries at most one vote per
group.** Any tripmate in the group may cast it or change it. The vote is
attributed to whoever cast it, and everyone in the group can see who that was.
An ungrouped member is a group of one, so nothing changes for them.

When `votingUnit = "member"` — the default — nothing changes for anybody.

## How it is implemented, and why this way

Votes stay exactly where they are: one row per `(proposalId, userId)` in
`date_votes`, `destination_votes`, `accommodation_votes` and E12's
`budget_votes`. On a write, when the trip votes per group, the new vote
**replaces any existing vote by another member of the same group** on that
proposal — delete the siblings, then upsert.

Every tally then works unchanged, because the rows are already one per group:
`scoreVotes` (`client/src/components/trip/VoteScore.tsx:33`) and every
`votes.length` in the pages need no edit.

The rejected alternative was a `groupId` column on four vote tables plus a tally
rewrite on both sides. It carries the same invariant in four places instead of
one, and the four would drift. This decision gets an ADR.

## Stories

### E11.1 — As a family, we cast one vote on a proposal

**Acceptance criteria**

- [ ] With `votingUnit = "group"`: two members of one group vote on one
      proposal; the proposal ends with **one** vote — the later one — attributed
      to whoever cast it last.
- [ ] The first member sees the vote change under them on refetch, labelled with
      who cast it. It does not change silently.
- [ ] An ungrouped tripmate still votes for themselves and is unaffected by
      anyone else's vote.
- [ ] With `votingUnit = "member"`, behaviour is what it is today. A regression
      test asserts it on a trip with no groups.
- [ ] A watcher still cannot vote, in either mode.

**Touches**

- `server/db.ts` — one new helper, `applyGroupVoteExclusivity(proposalType,
proposalId, tripId, userId)`, called **before** the upsert by every vote path:
  `dates.vote`, `destinations.vote` (`server/routers/destinations.ts:88-118`),
  `accommodations.vote`, and E12's `budget.vote`. It is a no-op when
  `votingUnit = "member"`.
- `server/routers/destinations.ts:50-55` — `create` casts an implicit `love`;
  it goes through the same helper, or proposing silently beats a groupmate's
  existing vote without the exclusivity rule ever running.

**Notes**

One enforcement point, called from four places, is the whole design. A second
place that writes a vote row without it reintroduces double votes on exactly one
proposal type, which is the hardest version of this bug to notice.

### E11.2 — As an admin, moving someone between groups leaves the votes correct

**Acceptance criteria**

- [ ] Moving a member into a group that has already voted leaves at most one
      vote per group on **every** proposal on the trip.
- [ ] The vote that survives is the most recently updated one (`updatedAt`).
- [ ] The dropped vote is recorded in the activity trail as `vote.superseded`,
      naming both members.
- [ ] Switching a live trip from member to group mode does **not** delete votes
      retroactively; the collapse happens on the next vote cast in that group,
      and the UI says so where the setting is changed.

**Touches**

- `server/db.ts` — `setMemberGroup` (E9) re-runs exclusivity across every
  proposal on the trip after the move.
- `drizzle/schema.ts:272-289` — `dateVotes.updatedAt` and its siblings already
  exist for exactly this question ("when did they decide this?"); this is the
  second caller.
- `ACTIVITY_ACTIONS` (`server/db.ts:884-905`) — `vote.superseded`.

**Notes**

This is the sharp edge of the epic and it must land in the same commit as E11.1.
A regroup that does not reconcile leaves a family holding two votes, and nothing
on screen says so: the count looks plausible, the score looks plausible, and the
only symptom is that a family quietly has more weight than the others.

Retroactive collapse was considered and rejected: silently deleting a vote
somebody cast last week, because an admin flipped a setting today, is worse than
the temporary inconsistency. Say what will happen at the switch instead.

### E11.3 — As anyone, "x/y voted" counts the things that actually vote

**Acceptance criteria**

- [ ] In group mode, the denominator is the number of **voters** — groups plus
      ungrouped tripmates — not people.
- [ ] In member mode, it is accepted tripmates, as today.
- [ ] **Watchers are in neither denominator.** Check the current derivation and
      fix it if it counts them.
- [ ] The denominator is computed once, on the server, and returned as
      `voterCount`; no page re-derives it.
- [ ] "Still to vote" lists the groups that have not voted, by group name, not
      the people in them.

**Touches**

- `server/routers/trips.ts` — `get` returns `voterCount`.
- `client/src/pages/TripDashboard.tsx:175-177` — `acceptedMembers` /
  `memberCount`, the current derivation, and the three `memberCount` props it
  feeds (`:534`, `:582`, `:625`).
- `client/src/components/trip/VotedCount.tsx:42-61` — the `memberCount` prop
  becomes the voter count; the label wording is unchanged.
- `server/db.ts` (`getProposalVoters`, behind `comments.voters`,
  `server/routers/comments.ts:21-36`) — return the group name beside the
  caster's, and list groups in `notVoted`.

**Notes**

Two derivations of one number is how one screen ends up saying "2/4" while the
next says "2/3". The server owns it. `VotedCount` already renders a plain string
for watchers (`VotedCount.tsx:68-72`), which stays correct.

## Open questions

None.

## Out of scope

- A voting unit set per proposal, or per section.
- A nominated group representative who alone may vote — any tripmate in the
  group may, and the attribution is the accountability.
- Weighting a group's vote by its size. One group, one vote, whatever its size:
  that is the point of the epic.
