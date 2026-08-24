# 0019. Grouping is a tripmate's job; deleting a populated group is not

- Status: Accepted
- Date: 2026-08-24

## Context

[ADR 0016](0016-one-vote-per-group.md) made a group the unit a trip of families
votes in, and [E9](../product/stories/E9-member-groups.md) made creating,
renaming, deleting and assigning admin actions.

That was the wrong half to lock. The person who knows which household somebody
is in is the person in it, and the members page hid the move control on your own
row (`canSeeDetails && !isMe`) — so nobody could add themselves to a group at
all, an admin included. Recording your own family meant asking somebody else to
do it, which is the kind of friction that ends with nobody being grouped and the
whole voting-unit feature going unused.

The danger in loosening it is the other direction. A regroup supersedes votes:
moving somebody can drop a vote that has become a duplicate, and nothing on any
screen says so beyond a toast. One tripmate quietly reorganising two families
they are in neither of is a real cost.

## Decision

Grouping is **self-service, bounded by the group you are in**:

- Any tripmate creates a group, and is put in it by default.
- Anyone moves **themselves** into any group on the trip, or out of all of them.
- A tripmate moves somebody else only **into or out of the group they are in
  themselves**.
- Renaming is admin, or a tripmate in that group.
- Everything else is an admin's.

The rule is `mayAssign` in `server/routers/groups.ts` — a pure function, tested
on fixtures rather than through the procedure, because the case that matters is
the one that looks harmless: `me.groupId == null` must grant nothing, or every
ungrouped member inherits rights over every other ungrouped member.

**Deleting a group is admin, or a tripmate clearing a group only they are in.**
Creating without being able to clear leaves the members page filling with empty
families nobody owns. Deleting a _populated_ one re-shapes other people's
grouping and every vote denominator on the trip, so it stays an admin's call; a
tripmate leaves a populated group by moving themselves out.

**The voting unit stays admin-only.** It changes every denominator on every
proposal screen at once, which is a decision about the trip rather than about
one household.

## Consequences

Every path that moves somebody — creating with `joinMe`, `assignMember`, and the
contact-book import — goes through one `reconcileAfterRegroup` helper. That
guarantee used to be a paragraph repeated at each call site, and a fourth mover
that forgot it would leave a family holding two votes with nothing on screen
saying so. `groupVoting.test.ts` asserts each mover reaches the helper.

**Plus and cross chips, not drag-and-drop**, although drag-and-drop is what was
asked for. This page is used on a phone, where a drag target the size of a
member chip is a coin toss; drag has no keyboard path, so a tap fallback would
have to exist anyway; and Slack's channel members, Notion and Google Contacts
labels all use tap-to-assign for this exact shape of problem. Desktop drag is a
reasonable enhancement layered on top later — as an addition, never as the only
way in.
