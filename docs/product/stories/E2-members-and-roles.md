# E2 — Members, roles and the contact book

- **Covers request items:** 2, 3
- **Status:** Done
- **Depends on:** E1 (shares `drizzle/schema.ts` and `server/db.ts`; sequencing
  avoids a merge conflict, not a functional dependency)

## Why

The app has two roles — `organizer` and `member` — and almost no enforcement of
either. `trips.update` lets any signed-in user rename any trip. `db.getTripMembers`
returns every member's email address to anyone who asks. There is no way to invite
someone and see whether they accepted, no record of which address an invite went
to, and no way to let someone watch a trip without also letting them vote on it.

Everything else in this programme — who may finalise a proposal, who may spend an
AI run, who appears in the activity trail, who may edit the trip — resolves to a
question this epic has to answer first.

## The role model

| Role         | Can                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Admin**    | Everything. Same rights as the trip creator: invite, change roles, edit the trip, finalise proposals, run AI, see all |
| **Tripmate** | Vote, add proposals, comment on proposals, set their own preferences, see member details and attribution              |
| **Watcher**  | View trip content only. No editing, no voting, no commenting. Sees other members' **names and nothing else**          |

Specifically, a watcher **cannot** see: any member's email address, who proposed
anything, when anything was created, who voted or how, or the activity trail. A
watcher receives no trip update notifications.

The trip creator (`trips.organizerId`) is always an admin and is the fallback if
role changes would otherwise leave a trip with none.

## Stories

### E2.1 — As a developer, one helper decides what a member may do, so that authorisation is not reinvented per router

**Acceptance criteria**

- [x] `requireTripRole(tripId, userId, minRole)` exists in
      `server/routers/_shared.ts`, throws `TRPCError` with `FORBIDDEN` for an
      insufficient role and `FORBIDDEN` (not `NOT_FOUND`) for a non-member, and
      returns the member row on success.
- [x] Role ordering is defined in one place: `watcher < tripmate < admin`.
- [x] Every mutation that changes trip state calls it. No procedure that writes
      trip data relies on membership alone.
- [x] `db.isTripOrganizer` has no remaining callers, or is reimplemented in terms
      of the new roles.
- [x] Tests cover: watcher blocked from voting, tripmate blocked from finalising,
      non-member blocked from reading.

**Touches**

- `server/routers/_shared.ts` — new helper. This file already holds the
  cross-router helpers (`toPublicUser`, password hashing, `extractLLMText`), and
  AGENTS.md designates it for exactly this.
- `server/routers/trips.ts:88` (`update` — **currently checks nothing**),
  `:141` (`members`), `:146` (`updateMemberBudget`).
- `server/routers/accommodations.ts:171,185` — inline `isTripOrganizer` calls in
  `delete` and `edit`.
- `server/routers/comments.ts:43` — inline `isTripOrganizer` in `delete`.
- `server/routers/dates.ts`, `destinations.ts`, `vibeBoard.ts`, `itinerary.ts`,
  `budget.ts`, `preferences.ts`, `referee.ts` — every mutation.
- `server/db.ts:1074` — `isTripOrganizer`.

**Notes**

Errors go to clients as `TRPCError` with a specific code and never leak internals
(AGENTS.md §5). Several routers currently `throw new Error("Not authorized")` —
e.g. `accommodations.ts:181,212` — which reaches the client as an
`INTERNAL_SERVER_ERROR`. Fix those as they are touched.

### E2.2 — As an admin, roles are Admin / Tripmate / Watcher, so that I can let someone follow the trip without giving them a vote

**Acceptance criteria**

- [x] `memberRoleEnum` is `["admin", "tripmate", "watcher"]`.
- [x] A migration maps existing `organizer → admin` and `member → tripmate`.
      Nobody becomes a watcher by migration.
- [x] Trip creation adds the creator as `admin`; joining by invite link adds
      `tripmate` unless the invite specified a role.
- [x] An admin can change any member's role from the members page.
- [x] The last admin on a trip cannot be demoted or removed; the attempt returns
      a clear message.
- [x] A member cannot change their own role.

**Touches**

- `drizzle/schema.ts:33` — the enum.
- `drizzle/0003_member_roles.sql` — new migration. Postgres enum values cannot be
  renamed in place while rows reference them in every case; the safe path is add
  the new values, update the rows, then drop the old ones. Write it out rather
  than relying on `drizzle-kit push`.
- `server/routers/trips.ts:80-86` (`create` sets `role: "organizer"`),
  `:125-130` (`join` sets `role: "member"`).
- New: `trips.updateMemberRole` procedure.
- `server/db.ts:501` (`addTripMember`), `:546` (`getTripMembers`).

**Notes**

`trips.organizerId` stays. It records who created the trip, which the summary and
activity trail both want, and it is the tiebreaker for "there must always be an
admin". It is not the authorisation check — role is.

### E2.3 — As a watcher, I see the trip but no personal details of anyone else, so that following a trip is not a privacy cost to the group

**Acceptance criteria**

- [x] A watcher's `trips.members` response contains names only — no `email`, no
      `budgetMax`, no invite addresses.
- [x] A watcher's proposal list responses (`dates.list`, `destinations.list`,
      `accommodations.list`) contain no `proposedBy`, no `createdAt`, and vote
      entries carry no `userId` or `user` — a vote count only.
- [x] A watcher receives no rows from the activity trail (E3) and no trip
      notifications.
- [x] Tests assert the **payload**, not the rendering: given a watcher's session,
      the JSON returned by each of those procedures contains none of the
      forbidden keys.
- [x] Vote, propose, comment, edit and finalise mutations reject a watcher.

**Touches**

- `server/routers/_shared.ts` — add projections beside `toPublicUser`, e.g.
  `projectProposalForRole()` and `projectMemberForRole()`.
- `server/db.ts:546-568` (`getTripMembers` selects `email`),
  `:594-620` (`getDateProposals`), `:706-732` (`getDestinations`),
  `:823-849` (`getAccommodations`) — all three embed `proposedBy` on the row and
  `{...vote, user}` per vote.
- `server/routers/notifications.ts` and every `db.createNotification` caller —
  skip watchers.

**Notes**

**Project at the router boundary, not in the page.** This is the same rule as
"never return credential columns to the client" (AGENTS.md rule 5), for the same
reason: a React component that declines to render a field has still received it,
and the next component will render it. The db functions can keep returning full
rows; the routers decide what leaves the process.

Cheapest correct shape: fetch the caller's member row once per request, pass the
role into a projection function, and apply it in the router before returning.

### E2.4 — As an admin, a members page shows me who is in, who is pending, and how they got there

**Acceptance criteria**

- [x] Route `/trips/:id/members` exists and renders for every role.
- [x] The trip details header icon is a **members** icon (`Users`), not
      `UserPlus`, and it navigates to the members page.
- [x] The members strip card at the top of the trip details page is gone
      (request item 2).
- [x] The list shows, per person: name, role, status (accepted / pending /
      declined), the email an invite was sent to (if any), how they joined
      (invite link or email invite), and when.
- [x] Admins see role controls and a remove action; tripmates see the list
      read-only; watchers see names and roles only.
- [x] Invite-by-link and invite-by-email both live on this page.

**Touches**

- `client/src/pages/TripMembers.tsx` — new.
- `client/src/App.tsx` — new route.
- `client/src/pages/TripDashboard.tsx:1008-1073` — the `headerRight` invite
  dialog moves to the members page; the icon becomes a link.
- `client/src/pages/TripDashboard.tsx:1077-1122` — the members strip card,
  deleted. Note `acceptedMembers` / `memberCount` (`:671-673`) are still used by
  the vote tallies further down the file, so keep the query and the derivation.

### E2.5 — As an admin, I can invite someone by email and see whether they accepted

**Acceptance criteria**

- [x] Sending an invite records it: trip, email, role offered, who invited, when.
- [x] A pending invite to an address with no account is listed on the members
      page as pending.
- [x] Accepting via the emailed link marks the invite accepted, records
      `joinedVia: "email"`, and creates the membership with the offered role.
- [x] Joining via a bare invite link records `joinedVia: "link"`.
- [x] Declining is recorded and shown; it does not delete the invite.
- [x] Re-inviting the same address does not create a duplicate row.
- [x] Only admins can invite.

**Touches**

- `drizzle/schema.ts` — new `tripInvites` table:
  `id, tripId, email, role, invitedBy, token, status (pending|accepted|declined|revoked),
sentAt, respondedAt, joinedVia`. Plus `invitedBy`, `joinedVia`, `respondedAt`
  on `tripMembers`.
- `server/routers/trips.ts:26-64` (`sendInviteEmail`) — write the invite row
  before sending; restrict to admins (it currently allows any member).
- `server/routers/trips.ts:116-140` (`join`) — consume a matching invite, set
  `joinedVia`, and use the invited role.
- `server/utils/mailer.ts` — `sendTripInviteEmail` already exists and already
  degrades to logging when SMTP is unset; the invite URL should carry the invite
  token, not just the trip's shared `inviteCode`.
- `client/src/pages/JoinTrip.tsx` — accept/decline.

**Notes**

`tripMembers.userId` is `notNull`, so a pending invite to an address that has no
account cannot be a member row. That is the whole reason for a separate
`tripInvites` table — do not work around it by creating placeholder users.

`trips.inviteCode` (the shared link) stays and keeps working. An emailed invite is
a token on top of it, which is what makes "joined via email" distinguishable from
"joined via link".

### E2.6 — As a member, I keep a contact book, so that I never type the same friend's email twice

**Acceptance criteria**

- [x] I can save a person (name + email) to my own contact book.
- [x] Inviting to a trip offers a picker over my saved contacts.
- [x] Picking a contact sends the same invite email as typing the address; the
      contact does **not** silently become a member.
- [x] Someone I invite can be saved to my contacts in one action from the members
      page.
- [x] My contact book is mine: no other user can read it.
- [x] Deleting a contact does not affect any trip membership.

**Touches**

- `drizzle/schema.ts` — new `contacts` table:
  `id, ownerUserId, name, email, contactUserId (nullable), createdAt`, unique on
  `(ownerUserId, email)`.
- `server/routers/contacts.ts` — new domain file (`list`, `add`, `remove`), plus
  one line in `server/routers/index.ts`. AGENTS.md rule 4: a new domain gets a new
  file, not an addition to an existing router.
- `server/db.ts` — the queries.
- `client/src/pages/TripMembers.tsx` — the picker and the save action.

**Notes**

`contactUserId` links to a real account when one exists so the picker can show
"already on this trip". It is nullable because most contacts will be an email
address and nothing more until they sign up.

An invited contact still receives an email and still has to accept. Saving someone
to a contact book grants no membership by itself — the request is explicit about
this and it is the difference between a convenience and a way to add people to
trips without their consent.

## Open questions

Both answered by the trip owner before implementation:

1. **Do watchers see the AI Referee feed?** **No** — hidden entirely.
   `referee.messages` requires tripmate, and the dashboard does not render the
   card for a watcher. It is commentary on other people.
2. **Do all existing members become tripmates?** **Yes** — `organizer → admin`,
   `member → tripmate`, nobody demoted to watcher.

**Found during implementation**

- `budget.summary` returned every member's `budgetMax` to anyone who asked. It
  is a personal figure and a watcher now gets an empty list for it. The story's
  list of leaking endpoints named the three proposal queries and `getTripMembers`
  but missed this one — **the payload, not the router file, is the thing to
  audit.**
- `requireTripRole`'s refusal message originally read "Watchers can view this
  trip but not change it", which is wrong for the two things a watcher is denied
  that are _reads_ (the referee feed and the invite list). It now says what the
  role allows rather than assuming a write was attempted.

## Out of scope

- Per-proposal permissions. Role is trip-wide.
- Transferring trip ownership (`organizerId`). Promoting a second admin covers the
  practical need.
- Contact groups, import from a phone or Google Contacts.
