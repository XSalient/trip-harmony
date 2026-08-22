# 0016. One vote per group is enforced when a vote is written

- Status: Accepted
- Date: 2026-08-22

## Context

A trip of families is not a flat list of voters. Two adults from one household
have one opinion and one wallet, but the app gave them two votes each — so on a
trip of four families, the family that brought two adults outvoted the one that
brought one.

Making a group cast one vote has to hold across four vote tables (`date_votes`,
`destination_votes`, `accommodation_votes`, `budget_votes`), every tally that
reads them on the server, and every count that renders them on the client. The
failure mode is silent: a family holding two votes looks exactly like a family
holding one. The count is plausible, the score is plausible, and nothing on any
screen says otherwise.

Two designs were considered.

**A `groupId` column on each vote table**, with the tallies grouping by it. It
puts one invariant in four schemas and rewrites `scoreVotes`, every
`votes.length`, and the voted/not-voted lists on both sides — four copies of a
rule that will drift, and a migration for each.

**Exclusivity at write time**: when the trip votes per group, writing a vote
first deletes any vote by another member of the same group on that proposal.

## Decision

Exclusivity at write time, in one helper —
`applyGroupVoteExclusivity(proposalType, proposalId, tripId, userId)` in
`server/db.ts` — called by every path that writes a vote, before the upsert.

The vote tables are unchanged. Every tally downstream works untouched, because
the rows are already one per group by the time anything reads them.

Two consequences follow from that choice and are part of the decision:

- **Moving a member between groups reconciles.** `setMemberGroup` re-runs the
  rule across every proposal on the trip, keeping the most recently updated vote
  and recording `vote.superseded` for the one it drops. Without this a regroup
  silently leaves a family with two votes.
- **Switching a live trip to group voting is not retroactive.** Votes already
  cast stand; the collapse happens on the next vote in that group. Deleting
  somebody's vote from last week because an admin changed a setting today is
  worse than the temporary inconsistency, and the UI says which will happen.

`trips.votingUnit` defaults to `member`, so a trip that never creates a group
behaves exactly as it did before any of this shipped.

## Consequences

- One place to get right, and one place to read to know the rule.
- No migration on the vote tables, and no change to `scoreVotes` or any count.
- **A second place that writes a vote row without the helper reintroduces double
  votes on exactly one proposal type** — the hardest version of this bug to
  notice. `server/routers/groupVoting.test.ts` therefore asserts both that every
  vote path calls it and that no other file writes a vote at all.
- The database does not enforce it. A row inserted by hand, by a migration, or
  by the demo seeder can still break the invariant — which is why the seeder
  runs `reconcileGroupVotes` after writing the story's votes.
- Attribution survives: the vote records who cast it, so a group can see which
  of them last spoke for it. That is the accountability that makes "anyone in
  the group may vote" safe.
