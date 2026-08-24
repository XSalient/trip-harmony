# E13 — Going with the majority

- **Status:** Done
- **Depends on:** E11 (the voter count this shares a denominator with)
- **Decision:** [ADR 0018](../../adr/0018-going-with-the-majority-is-an-abstention.md)

## Why

Votes are Yes, Maybe and No. Somebody who genuinely does not mind has to invent
an opinion or stay silent, and silence is the worse of the two: "3/6 voted" is a
chase list, and a person with no preference sits on it indefinitely holding up a
decision they do not care about.

The trap that comes with fixing it is that a proposal _everybody_ abstains on
renders identically to consensus — a full turnout, a score of zero, and a
padlock an admin can press.

## The rule

"Go with the majority" is an **abstention**: worth nothing, counted as having
voted, and shown separately from the Yes/Maybe/No counts — never folded into
them. **Finalising is refused when every cast vote is one.** A proposal nobody
has voted on at all is unaffected.

## Stories

### E13.1 — As a tripmate, I can say I have no preference, so the count is not waiting on me

- [x] A fourth vote option on dates, suggestions, accommodations and budget.
- [x] It counts in "x/y voted" — that is the point of it.
- [x] It is worth 0 in the score, and the score dialog says so.
- [x] The abstentions are named beside the tally ("2/5 voted · 3 going with the
      majority") and never added to the Yes/Maybe/No counts.
- [x] The dates bar gets a fourth segment, or it stops summing to the votes cast.

### E13.2 — As an admin, I cannot finalise something nobody had an opinion about

- [x] `PRECONDITION_FAILED` from all four lock mutations when every cast vote is
      an abstention, with a message a person can act on.
- [x] **Only on the way in.** Un-finalising is never blocked.
- [x] A proposal with no votes at all stays finalisable — `isAllMajority([])` is
      false, and that boundary is asserted.
- [x] The padlock is disabled with the reason as its title. The server refuses
      regardless; this only saves pressing a control that would fail.

### E13.3 — One home for what a vote is worth

- [x] `shared/votes.ts` holds the values, labels, tones, weights, `scoreVotes`
      and `finaliseBlockReason`. The three copies in `VoteScore.tsx`,
      `budget.ts` and `prompts/referee.ts` are gone.
- [x] `VoteScore`'s dialog takes a `voteSet`, so a budget card does not list
      "available/maybe/unavailable".

**Touches** — `shared/votes.ts` (new), `drizzle/0012_go_with_the_majority.sql`
(new), `drizzle/schema.ts` (four enums), `server/routers/_shared.ts`
(`assertFinalisable`), the four proposal routers, `server/prompts/referee.ts`,
`client/src/components/trip/{VoteScore,VotedCount,LockToggle,ProposalRow,AbstainButton}.tsx`,
the four proposal pages and `TripDashboard.tsx`.

**Tests** — `shared/votes.test.ts` (fixtures) and `locking.test.ts` (structural:
each lock calls the guard, before it writes, and only when locking).

## Test script

1. Two of three voters choose "Go with the majority" on a suggestion → "2/3
   voted · 2 going with the majority", score `+0`, padlock disabled with its
   reason. Calling `destinations.setLock` directly returns `PRECONDITION_FAILED`.
2. The third votes Yes → finalising succeeds.
3. Everybody returns to abstaining on an already-finalised proposal →
   un-finalising still works.
