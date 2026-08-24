# 0018. "Go with the majority" is an abstention, and an all-abstained proposal cannot be finalised

- Status: Accepted
- Date: 2026-08-24

## Context

Votes were Yes, Maybe and No. Somebody who genuinely did not mind had two
options: invent an opinion, or say nothing. Saying nothing is worse than it
looks — "3/6 voted" is a chase list, and a person with no preference sits on it
indefinitely holding up a decision they do not care about.

Adding a fourth value raises two questions that look like one.

**What is it worth?** Two readings of "go with the majority" are available. As
an **abstention** it is worth zero and is reported separately. As a **proxy** it
resolves at finalise time to whichever side is winning, so two Yes votes and
three majority-followers read as five Yes.

**What does it mean when everybody casts it?** Under the proxy reading, nothing
— there is no majority to follow, and the resolution is undefined. Under the
abstention reading it is a proposal with a full turnout and no opinions in it,
which renders identically to consensus: "5/5 voted", a score of 0, and a padlock
an admin can press.

## Decision

**An abstention, worth zero, never folded into the Yes/Maybe/No counts.** The
screen says "2/5 voted · 3 going with the majority" — the abstentions are named,
not absorbed. Counting somebody as agreeing with a side they did not choose puts
words in their mouth, and the whole reason a person picks this option is that
they did not want to say one thing or the other.

**Finalising is refused when every cast vote is an abstention**, on all four
proposal types, server-side, with `PRECONDITION_FAILED` and a message a person
can act on. The rule guards the lock only: un-finalising something already in
that state must always be possible, or a proposal locked before this shipped is
trapped.

**A proposal with no votes at all is not blocked.** An admin locking in the only
stay anybody found is a real thing people do, and `isAllMajority([])` is false
on purpose. That boundary is the easiest thing here to get wrong in the other
direction, and no screen would explain why the padlock had stopped working.

The rule lives in `shared/votes.ts` as `finaliseBlockReason`, which returns the
sentence rather than a boolean, so the padlock's tooltip and the server's
refusal cannot word it differently. `assertFinalisable` in
`server/routers/_shared.ts` is the throwing wrapper the four routers call, and
`locking.test.ts` asserts structurally that each calls it, before it writes, and
only when locking.

## Consequences

`shared/votes.ts` is now the single home for vote values, labels, tones and
weights. Three copies of the weight table existed — `VoteScore.tsx`,
`budget.ts`, `prompts/referee.ts` — so the badge on a card, the figure the
server ranked by and the number the AI referee reasoned about were three
implementations of one rule. Adding a fourth value to three copies is how they
drift, and they are gone.

The client disables the padlock and shows the reason. It is not the enforcement
— the server refuses regardless — it only saves somebody pressing a control that
was always going to fail.

`majority` was added to four enums by migration `0012`, which contains nothing
else: Postgres will not let a value be _used_ in the transaction that added it,
and drizzle may apply several pending migrations in one. No later migration may
reference it, which is why `0013` and `0014` do not.
