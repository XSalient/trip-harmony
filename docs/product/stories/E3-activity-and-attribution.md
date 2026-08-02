# E3 — Activity trail and attribution

- **Covers request items:** 4, 5
- **Status:** Done
- **Depends on:** E2 (watcher projections), E6 (lock events to record)

## Why

The app records what the group decided but not how it got there. A proposal shows
no author on its detail screen. `x/x voted` is a count with no way to find out
which two of six people have not voted yet — which is the single most common
question in a stalled group chat. And nothing at all is stored about the sequence
of events, so nobody can answer "when did this change?"

The data is half there already: every proposal row has `proposedBy` and
`createdAt`, and every vote row has `userId` and `createdAt`. It just never
reaches the screen.

## Stories

### E3.1 — As a member, every trip action is recorded, so that the trip has a history

**Acceptance criteria**

- [x] `activityEvents` table exists and is written on: proposal added, edited,
      deleted, locked, unlocked; vote cast, changed, withdrawn; comment added,
      deleted; member invited, joined, declined, removed, role changed; trip
      details edited; AI run triggered.
- [x] Every write records actor, trip, action, entity type, entity id, a UTC
      timestamp, and a small metadata object (e.g. the vote value).
- [x] Writing an event never fails the user's action — a broken trail is a
      logged warning, not a 500.
- [x] The event list is queryable per trip, newest first, paginated.
- [x] Watchers get an empty list.
- [x] Deleting a proposal leaves its events intact.

**Touches**

- `drizzle/schema.ts` — new `activityEvents` table:
  `id, tripId, actorUserId, action, entityType, entityId, metadata (text/JSON),
createdAt`. Index on `(tripId, createdAt)`.
- `server/db.ts` — `recordActivity()` and `getTripActivity()`.
- Every mutating router: `trips.ts`, `dates.ts`, `destinations.ts`,
  `accommodations.ts`, `comments.ts`, `vibeBoard.ts`, `itinerary.ts`,
  `budget.ts`, `preferences.ts`, `referee.ts`.

**Notes**

Define the action verbs in one exported union type next to `recordActivity`, so
they do not accrete ad hoc across ten routers. Suggested shape:
`"<entity>.<verb>"` — `proposal.created`, `proposal.locked`, `vote.cast`,
`member.role_changed`, `ai.match_refreshed`.

Store `metadata` as JSON text, consistent with how `accommodations.matchAnalysis`
and `memberPreferences.attributes` are already stored.

This table grows fastest of anything in the schema. It has no delete path in this
epic and does not need one yet; note it as a future retention question rather than
building one now.

### E3.2 — As a member, a proposal's detail screen tells me who added it and when

**Acceptance criteria**

- [x] Each proposal on the dates, places and accommodations detail screens shows
      "Added by <name> · <relative time>".
- [x] The name resolves for the current user as "You".
- [x] A watcher sees neither the name nor the time.
- [x] A locked proposal also shows who finalised it and when (from E6).

**Touches**

- `server/db.ts:594-620` (`getDateProposals`), `:706-732` (`getDestinations`),
  `:823-849` (`getAccommodations`) — each joins `users` for **votes** but not for
  the proposer. Add a proposer join, following the existing pattern.
- `client/src/pages/TripDates.tsx`, `TripDestinations.tsx`,
  `TripAccommodations.tsx` — render it.

**Notes**

These three db functions already run one query per proposal and one per vote to
resolve names — an N+1 that gets worse with a fourth join per row. If a trip with
20 proposals feels slow, the fix is to fetch the trip's members once and resolve
names in memory; they are all in the same trip.

### E3.3 — As an admin or tripmate, I can see who voted and when, so that I know who to chase

**Acceptance criteria**

- [x] `x/x voted` is a control, not static text.
- [x] Activating it lists every member with their vote and the time they cast it,
      and lists members who have not voted.
- [x] Available to admins and tripmates. Watchers see the count only, and the
      count is not a control for them.
- [x] A vote changed after it was first cast shows the time it was **changed**,
      not the time it was first cast.
- [x] Works on the dates, places and accommodations detail screens.

**Touches**

- `drizzle/schema.ts` — add `updatedAt` to `dateVotes`, `destinationVotes`,
  `accommodationVotes`.
- `server/db.ts:662-684` (`voteDateProposal`), `:734-756` (`voteDestination`),
  `:851-873` (`voteAccommodation`) — all three take the update branch on a
  re-vote and set only `vote`, leaving `createdAt` at the original time. Set
  `updatedAt` there.
- The three detail pages, plus a shared voter-breakdown component.

**Notes**

The bug is real and easy to miss: change your vote from "love" to "veto" and the
UI would report the moment of your **first** vote. Adding the column without
setting it in the update branch fixes nothing.

`getTripMembers` gives the full roster, so "who has not voted" is the roster minus
the vote authors — no new query.

### E3.4 — As a member, places and accommodations show `x/x voted` on their detail screens too

**Acceptance criteria**

- [x] The places detail screen shows `x/x voted` per proposal.
- [x] The accommodations detail screen shows `x/x voted` per proposal.
- [x] The denominator is accepted members, matching the dashboard's existing
      count.
- [x] Both are the E3.3 control, not static text.

**Touches**

- `client/src/pages/TripDestinations.tsx`, `client/src/pages/TripAccommodations.tsx`.

**Notes**

This is request item 5 and it is small: the dashboard already renders exactly this
at `TripDashboard.tsx:1459` (places) and `:1601` (accommodations), and
`TripDates.tsx:636` already has it on a detail screen. Copy the pattern, then let
E3.3 turn all four into the same control.

## Open questions

- **Where does the activity trail surface?** **Answered: nowhere, as a feed.**
  The owner's call: store everything, show it only where showing it makes sense,
  and keep it as unobtrusive side information. So there is no activity view.
  What reaches a screen is "Added by … · date" beneath a proposal, and the
  who-voted-when breakdown behind `x/x voted`. `getTripActivity` exists and is
  correct; nothing calls it yet, deliberately.

**Found during implementation**

- **The first vote on a proposal was recorded as `vote.changed`.** Creating a
  proposal already casts the author's own vote ("proposing is itself a vote"),
  but that implicit vote was never recorded — so the trail showed a change from
  a vote that, as far as the history went, never happened. All three create
  paths now record it as `vote.cast` with `implicit: true`. **Caught by reading
  the actual rows, not by any test** — every unit assertion passed while the
  story the table told was wrong.
- The three proposal listings were N+1: a query per proposal for its votes, plus
  one per vote for the voter's name. Adding the proposer would have made it
  worse, so they now fetch votes in one `inArray` query and resolve every name
  through a single `namesByUserId` lookup.
- `TripDestinations` and `TripAccommodations` had no accepted-member count, so
  the new `x/x voted` had no denominator. Added to both.

## Out of scope

- Retention or archival of `activityEvents`.
- Undo built on the trail. It records; it does not reverse.
- Editing history for comments (who edited what text). Comments have no edit
  feature today.
