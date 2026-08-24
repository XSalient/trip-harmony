# E14 — Groups are self-service

- **Status:** Done
- **Depends on:** E9 (the groups), E11 (the reconcile this must not skip)
- **Decision:** [ADR 0019](../../adr/0019-groups-are-self-service.md)

## Why

E9 made creating, renaming, deleting and assigning admin actions, and the
members page hid the move control on your own row — so **nobody could add
themselves to a group, an admin included.** The person who knows which household
somebody is in is the person in it, and having to ask somebody else to record
your own family is the friction that ends with nobody being grouped at all and
the whole voting-unit feature going unused.

## The rule

A tripmate creates a group (and is in it by default), moves **themselves**
anywhere, and moves other people only **into or out of the group they are in
themselves**. Renaming is admin or a tripmate in the group. Deleting is admin,
or a tripmate clearing a group only they are in. The voting unit stays
admin-only: it changes every denominator on the trip at once.

## Stories

### E14.1 — As a tripmate, I can put my own family together

- [x] `groups.create` requires a tripmate, and takes `joinMe` (default true).
- [x] `groups.assignMember` allows self-assignment to any group or to none.
- [x] A tripmate can pull somebody into, or push somebody out of, their own
      group; anything else is `FORBIDDEN` with a message naming the limit.
- [x] `mayAssign` is a pure exported function, tested on fixtures. An ungrouped
      member (`groupId == null`) gains **nothing** over other ungrouped members.
- [x] Renaming uses the existing `requireGroupAccess`.
- [x] Deleting a populated group is still admin-only; a tripmate may delete one
      holding only themselves, counting attendees as well as members.

### E14.2 — I can see and change it in one place, on a phone

- [x] Member chips per group, with `×` for anyone the caller may move and a
      dashed `+` opening a short list — yourself first, labelled "You".
- [x] The move entries appear on your own row in the members list; role changes
      and remove-from-trip stay admin-only and stay off your own row.
- [x] An empty dropdown never renders.
- [x] **Chips, not drag-and-drop** — see the ADR.

### E14.3 — A move never leaves a family holding two votes

- [x] Every mover — `create` with `joinMe`, `assignMember`, and the contact
      import — goes through one `reconcileAfterRegroup` helper.
- [x] The dropped votes reach the activity trail as `vote.superseded`, and the
      toast says so.

**Touches** — `server/routers/groups.ts`, `client/src/pages/TripMembers.tsx`.

**Tests** — `groupAccess.test.ts` (fixtures over `mayAssign`, plus the role
sweep), `groupVoting.test.ts` (every mover reconciles).

## Test script

1. As a tripmate: create a group with "Put me in it", confirm `trips.members`
   shows your `groupId`.
2. Pull a groupmate in from the `+` chip; try to move somebody in a third group
   → `FORBIDDEN`.
3. With the voting unit on `group`, confirm `trips.get`'s `voterCount` counts the
   family once, and that a regroup which would double a vote records
   `vote.superseded`.
