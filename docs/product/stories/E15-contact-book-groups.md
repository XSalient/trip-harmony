# E15 — Contact-book groups

- **Status:** Done
- **Depends on:** E2 (the contact book), E14 (the assignment rules and the reconcile)

## Why

The address book knows people, not households. Adding the same five Patels to a
second trip means typing five addresses again and then grouping them again by
hand — and a family is not only its adults, so a book that can only hold people
with email addresses cannot hold a family at all.

## The rule

A contact group is a **saved label over the book**, private to its owner. It
grants nothing: importing one into a trip still sends invites that still have to
be accepted. Saving a family that already exists **appends** whoever is new.

Importing is **two calls of one procedure**. The first writes nothing and
returns what the second would do — including anybody already on this trip in a
_different_ group, named rather than counted, because taking somebody out of the
family they are recorded in is a real change to somebody else's plan.

## Stories

### E15.1 — As a tripmate, I can save a family from a trip

- [x] Tripmate and above — a watcher is never shown member addresses and must
      not collect them through here.
- [x] Addresses come from the memberships, never from the caller.
- [x] Members with accounts and attendees without both go in; an attendee row
      that stands for a member does not save the same person twice.
- [x] Saving again appends only who is new, and says "3 added, 2 already saved".
- [x] Two partial unique indexes make that true under a double-tap.

### E15.2 — As a tripmate, I can add a saved family to a trip, and see what it disturbs first

- [x] `confirm: false` writes nothing and returns the plan: conflicts, moves,
      invites, attendees, and who is already in the group.
- [x] The dialog names each conflict — "Sam is already on this trip in The
      Patels" — and says a move can drop a vote that has become a duplicate.
- [x] `confirm: true` creates the group if needed, moves everybody (conflicts
      included, having just been confirmed), reconciles votes **once**, adds the
      attendees, and invites the rest.
- [x] Both come from the same `planImport`, so the preview cannot describe
      something other than what happens.
- [x] One undeliverable address does not lose the other four; the result names
      them.

### E15.3 — Somebody invited as part of a family arrives as part of it

- [x] `trip_invites.groupId`, carried into the membership **and** the attendee
      row on acceptance. Without it a family of five accepts into five ungrouped
      memberships and an empty group.
- [x] The role rule is `trips.sendInviteEmail`'s, unchanged: importing people as
      tripmates grows the voting group, so it stays admin-only and a tripmate's
      import brings them in as watchers.
- [x] Both invite paths go through one `utils/tripInvite.ts` helper;
      authorisation stays in the routers.

**Touches** — `drizzle/0013_contact_groups.sql` (new), `drizzle/schema.ts`,
`server/db.ts`, `server/utils/tripInvite.ts` (new), `server/routers/contacts.ts`,
`server/routers/trips.ts`, `client/src/pages/TripMembers.tsx`.

**Tests** — `contactGroups.test.ts` (fixtures over `planImport`, plus structural:
the preview writes nothing, one reconcile, the invite rule), `invites.test.ts`
(nothing else writes an invite row or sends the email itself).

## Test script

1. Save a trip group to contacts; add somebody to it; save again → appends one.
2. Import it into a second trip where one person is in a different group: the
   preview writes nothing and names them; confirming moves them, reports
   `votesSuperseded`, adds the children, and invites the rest.
3. An invited contact accepts → their membership _and_ their attendee row are in
   the imported group.
