# 0021. A dragged member moves on the drop, not on the server's answer

- Status: Accepted
- Date: 2026-08-25

## Context

[E13–E16](../product/) added dragging a member chip between families, and the
[status note](../PROJECT_STATUS.md) already records one bug it shipped with: the
chip in hand is under the pointer for the whole gesture, so the first hit test
resolved every drop back to where the drag started.

It shipped with a second one that looks identical from a chair. The drop was
accepted and the move was written — and the chip animated back to the card it
came from and stayed there. `dragSnapToOrigin` returned it on pointer-up, and
`groups.assignMember` had no optimistic update, so nothing could move it into
its new card until the mutation **and** five cache invalidations had returned:
`groups.list`, `groups.attendees`, `groups.headcount`, `trips.members` and
`trips.get`. Behind an N+1 `getTripMembers` and a three-connection pool
([ADR 0012](0012-session-pooler-for-the-database-url.md)) that is a second or
more, during which the screen actively says nothing happened. The "Moved" toast
fired before any of it, because the refresh was never awaited.

So people dragged the same person again. Each re-drag queued another mutation,
another vote reconciliation across all four proposal types, and another five
refetches — the interface's own feedback making the thing it was reporting on
slower.

The instinct is to fix this by making the server faster. That was worth doing
and has been done, but it is not the fix: a network is a network, and a drag
that waits for one will always be able to look broken on a train.

## Decision

**A drag is applied to the cache on the drop, and confirmed afterwards.**

`groups.assignMember` carries `onMutate` / `onError` / `onSettled`:

- `onMutate` cancels the queries in flight, snapshots them, and patches
  `trips.members` — the query that positions the chip — and `groups.attendees`,
  whose rows follow their member on the server anyway.
- `onError` restores both snapshots. **A patch without a rollback is worse than
  the wait it replaced**: a screen that lies permanently beats one that is
  briefly behind.
- `onSettled` reconciles.

Which caches are authoritative and which are derived matters, so it is written
down rather than rediscovered:

| Query              | On an assign                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trips.members`    | changes; patched; the chip's position comes from here                                                                                                                                   |
| `groups.attendees` | changes; patched; a member's own attendee row follows them (`db.setMemberGroup`)                                                                                                        |
| `groups.headcount` | derived; not patched, refetched — keeping a client reducer in step with `getTripHeadcount` is two derivations of one number, which is how one screen says "2/4" and the next says "2/3" |
| `groups.list`      | **cannot change.** `getTripGroups` selects `trip_groups` alone: no members, no counts                                                                                                   |
| `trips.get`        | changes only when `votingUnit === "group"`, and only `voterCount`                                                                                                                       |

Five invalidations become two, and on a trip that votes by member, one.

**The chip's transform is zeroed on release rather than animated home**, and a
`layoutId` carries it from wherever it was let go into the card the patch just
re-parented it into. Removing `dragSnapToOrigin` without the optimistic update
would leave the chip floating over the wrong card instead; the two are one
change.

## Consequences

A move is visible immediately on any connection, and the toast is no longer a
claim made before the thing it claims.

The cost is that the client now encodes a rule the server also encodes — that a
member's attendee row follows them. Two statements of one rule can drift. It is
worth it here because that rule is one line in `db.setMemberGroup` and it is
what stops the headcount caption contradicting the chips for a second; a rule
with any more to it belongs on the server alone, and the derived queries are
refetched precisely so it does not have to be restated.

Copy this shape for the other direct-manipulation gestures, and only those.
Optimism is right where the person has already expressed the change with their
hands and the server is overwhelmingly going to agree. It is wrong where the
server decides something the client cannot predict — anything that supersedes
votes, finalises, or depends on what somebody else did — and a form with a Save
button is not a gesture and does not need it.

Structural tests in `client/src/components/trip/dragDrop.test.ts` hold the
guarantees: the patch, the rollback, the cancel before the patch, the absent
`groups.list` refetch, and the absence of `dragSnapToOrigin`.
