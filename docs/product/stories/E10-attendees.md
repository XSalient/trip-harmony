# E10 — Attendees: who is actually coming

- **Covers request items:** 19, 20
- **Status:** Not started
- **Depends on:** E9 (an attendee belongs to a group)

## Why

A trip needs to know how many people are coming, how many are adults, how many
are children and how old they are, and whether there is a dog. None of those
people need an account, and most of them cannot have one. Today the only way to
record a six-year-old is to invite them as a member, which gives a six-year-old
a login, a vote and an email.

## The rule

An **attendee** is anyone coming on the trip. Members with accounts are
attendees too — one row each, created when they accept — so headcount is one
number and never "members plus attendees, mind the overlap".

An attendee has a `kind`: `adult`, `child` or `pet`. **Age is optional and is
never asked for a pet.** An attendee has no login, casts no vote, appears in no
vote denominator and receives no notification.

`people = adults + children`. **A pet is never in a per-person divisor** — not
in headcount, not in a budget split, not in the summary's "per person".

## Stories

### E10.1 — As a tripmate, I can record everyone travelling with me, including people who will never open the app

**Acceptance criteria**

- [ ] I can add an adult, a child with an age, and a pet to my group.
- [ ] The form offers no age field for a pet, and the row saves with `age = null`.
- [ ] I can edit and remove attendees in **my own** group; an admin can do it for
      any group.
- [ ] A tripmate cannot add or edit attendees in someone else's group; a watcher
      cannot add any.
- [ ] Deleting a group leaves its attendees on the trip, ungrouped — the same
      rule as members (E9.1).
- [ ] An attendee receives no notification, ever, and appears in no vote
      denominator.

**Touches**

- `drizzle/schema.ts` — new `attendee_kind` enum and `trip_attendees` table:
  `id, tripId, groupId (nullable), memberUserId (nullable), name, kind, age
(nullable), notes, createdAt`.
- `drizzle/0009_trip_attendees.sql` — the table, a partial unique index on
  `(tripId, memberUserId) where memberUserId is not null`, and a **backfill of
  one adult attendee per accepted member** so an existing trip's headcount is
  right the moment the migration lands.
- `server/routers/groups.ts` — `attendees.list` / `add` / `edit` / `remove`.
  Attendees are group content, not their own domain, so they go in the groups
  router rather than a fourth file.
- `server/db.ts` — `getTripAttendees`, `createTripAttendee`,
  `updateTripAttendee`, `deleteTripAttendee`; the clone and delete sets
  (`:433`, `:494`).
- `server/routers/trips.ts` — where a membership becomes `accepted` (`join`) and
  where a member is removed: create and delete the matching attendee row.

**Notes**

`memberUserId` is the join back to an account, and the partial unique index is
what stops a re-accept from doubling the count. It is nullable because most
attendees are a name and nothing else — the same shape, and the same reason, as
`contacts.contactUserId` (E2.6).

Age is nullable for two distinct reasons that happen to share a column: a pet
has no meaningful one, and an adult need not give theirs. Do not make it
required for adults later without deciding what to do with the rows that
already exist.

### E10.2 — As anyone on the trip, I can see how many people are coming and what they are

**Acceptance criteria**

- [ ] The trip summary reads "6 adults · 3 children · 1 pet", counting each
      person exactly once.
- [ ] Each group shows its own headcount on the members page.
- [ ] `getTripHeadcount` never counts a pet in `people`.
- [ ] A watcher gets names and kinds but **no ages** — asserted on the payload.

**Touches**

- `server/db.ts` — **`getTripHeadcount(tripId)`** returning
  `{ adults, children, pets, people, byGroup }`. This is the only place headcount
  is computed; the summary card, E12's budget maths and the referee all call it.
- `client/src/components/trip/TripSummary.tsx` — the headline figures.
- `client/src/pages/TripMembers.tsx` — the per-group count.
- `server/routers/groups.ts` — strip `age` for a watcher, beside the projections
  in `server/routers/_shared.ts`.

**Notes**

An age is the most personal field on the members page and the only one a watcher
has no argument for. It joins email and `budgetMax` on the watcher's deny list —
see `projectMembersForRole` (`server/routers/_shared.ts:178-199`) and the note in
E2.3 about auditing the payload rather than the router file.

Headcount lives in one function on purpose. The pet-in-the-divisor bug is
invisible in the UI — a per-person figure that is 12% too low still renders — so
the defence is that only one function can make it, and it is unit-tested for it.

## Open questions

None.

## Out of scope

- Rooming assignments, dietary requirements, passport or travel-document
  details, and anything else an attendee row could grow into.
- Weighting a child as a fraction of an adult in a budget split — see E12.
- Giving an attendee a login later, or promoting one to a member.
