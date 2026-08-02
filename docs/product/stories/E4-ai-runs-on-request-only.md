# E4 — AI runs only when asked

- **Covers request items:** 6, 7
- **Status:** Done
- **Depends on:** E1 (same files), E2 (admin-only triggers)

## Why

AI match analysis runs itself, twice over, and nobody asked it to.

`accommodations.create` fires `runAccommodationMatchAnalysis` on every stay added
(`server/routers/accommodations.ts:126`). `preferences.save` fires
`runTripMatchAnalyses`, which loops every accommodation in the trip and analyses
all of them (`server/routers/preferences.ts:35`, `matchAnalysis.ts:171-180`).

A trip with 10 accommodations where 6 members each save their preferences once is
60 model calls, plus 10 more from adding the stays — 70 calls nobody requested,
most of them superseded before anyone reads them. Each call sends every member's
preferences and the full accommodation description.

The fix is not a smaller prompt. It is that **an AI call is something a person
asks for**.

## Interpretation

Request items 6 and 7 read "Limit running AI" and "Limit AI match". Confirmed with
the owner: **stop AI match analysis auto-running; every AI call becomes an
explicit action.** This epic implements that, plus a cooldown so a button cannot
be leaned on. A hard numeric quota (N runs per trip per day) is the variant to
pick up if that was also wanted — see the open question.

## Stories

### E4.1 — As a member, adding an accommodation or saving my preferences does not trigger AI, so that the group's AI budget is spent deliberately

**Acceptance criteria**

- [x] `accommodations.create` makes no LLM call.
- [x] `preferences.save` makes no LLM call, and does not touch other members'
      accommodations.
- [x] Saving preferences is measurably faster and issues no background work.
- [x] `runTripMatchAnalyses` is either deleted or reachable only from the explicit
      admin action in E4.3.
- [x] No other router calls `invokeLLM` without a user having asked for it.

**Touches**

- `server/routers/accommodations.ts:125-126` — the fire-and-forget call.
- `server/routers/preferences.ts:34-35` — the trip-wide re-analysis.
- `server/routers/matchAnalysis.ts:171-180` — `runTripMatchAnalyses`.

**Notes**

Audit the other three AI paths while here. `dates.parseNatural`,
`accommodations.fetchFromUrl` and `accommodations.parseAttributes` are all already
triggered by a person pressing something — they stay as they are. `referee.analyze`
is user-triggered but uncapped; E4.4 covers it.

### E4.2 — As a member, I can see when an AI match result is out of date, so that stale advice does not read as current

**Acceptance criteria**

- [x] An accommodation whose `matchAnalysedAt` is older than the most recent
      preference change on the trip is labelled as possibly out of date.
- [x] An accommodation that has never been analysed says so, rather than showing
      nothing.
- [x] The label appears next to the existing match display on the accommodations
      screen.
- [x] The label is not a spinner and does not trigger anything by itself.

**Touches**

- `client/src/pages/TripAccommodations.tsx:1118-1119` — where `matchAnalysis` is
  parsed and rendered.
- `server/routers/accommodations.ts` — return the trip's latest preference
  timestamp alongside the list, or expose it from the `preferences` router.

**Notes**

Both columns needed for this already exist: `accommodations.matchAnalysedAt`
(`drizzle/schema.ts:257`) and `memberPreferences.updatedAt`
(`drizzle/schema.ts:344`). Nothing new in the schema.

`TripAccommodations.tsx:111` currently checks `!a.matchAnalysis` to decide
something about un-analysed stays — reconcile that with this label rather than
adding a second notion of "needs analysis".

### E4.3 — As an admin, I choose when match analysis runs, so that it happens once when it is worth it

**Acceptance criteria**

- [x] Refreshing the match for one accommodation is an explicit action, available
      to admins only.
- [x] An "analyse all" action exists for admins, runs over the trip's
      accommodations, and reports progress and completion.
- [x] Tripmates and watchers see match results but cannot trigger a run.
- [x] A run in flight cannot be started again for the same accommodation.
- [ ] Every trigger is recorded in the activity trail (E3) as `ai.match_refreshed`.
      **Deferred — E3 has not been built.** Pick this up with E3.1.

**Touches**

- `server/routers/accommodations.ts:217-227` (`refreshMatch`) — add
  `requireTripRole(..., "admin")` from E2.1. Note it currently takes `tripId`
  from the client input without checking it matches the accommodation; derive it
  from the accommodation row instead.
- New: an `analyseAll` procedure, or `refreshMatch` accepting no accommodation id.
- `client/src/pages/TripAccommodations.tsx:140,153` — the existing
  `refreshMatchMutation` call site.

**Notes**

"Analyse all" is the deliberate version of what `preferences.save` used to do by
accident. The difference is that a person chose the moment, once, instead of it
happening six times as six people fill in a form.

Run them sequentially, not with `Promise.all` — the old code fired every
accommodation at the model simultaneously (`matchAnalysis.ts:174-176`).

### E4.4 — As a group, the AI Referee cannot be spammed

**Acceptance criteria**

- [x] `referee.analyze` is admin-only.
- [x] A cooldown applies per trip; a call inside the window returns the last
      message with a clear "analysed <n> minutes ago" rather than an error page.
- [x] The remaining cooldown is visible on the referee screen, and the button is
      disabled while it applies.
- [x] The fallback message path still works when the model is unavailable.

**Touches**

- `server/routers/referee.ts:16-109` — the `analyze` mutation.
- `client/src/pages/TripReferee.tsx:52,61` — the trigger.

**Notes**

The cooldown needs no new storage: `refereeMessages` already has `createdAt` per
trip, and `db.getRefereeMessages(tripId)` returns them newest-first. The most
recent message's age is the cooldown state.

Keep the existing fallback at `referee.ts:99-108` — when the model fails it writes
a nudge rather than surfacing an error, and that behaviour is correct.

## Open questions

1. **Is a hard numeric quota wanted?** **Answered: no.** The owner picked "stop
   auto-running AI match" over "rate/quota caps per trip per day" when the
   programme was scoped, so a numeric cap was actively declined rather than left
   open. What shipped is "no AI without a deliberate action, plus a cooldown".
   If a cap is wanted later it needs a counter — `activityEvents` from E3 would
   carry it.
2. **What cooldown length?** **10 minutes**, as proposed, in
   `REFEREE_COOLDOWN_MS`.

**Found during implementation**

- **`refreshMatch` trusted a client-supplied `tripId`** that was never checked
  against the accommodation, so the role check could be satisfied with a trip you
  administer while analysing a stay on one you don't. The trip now comes from the
  accommodation row and the input no longer takes it.
- **The accommodations screen polled every 5 seconds** while any stay had no
  analysis, waiting for a background job. Nothing runs in the background now, so
  the poll would have run forever against stays nobody had asked to analyse. Gone.
- **E2 left the five proposal/detail pages gating on
  `trip?.organizerId === user?.id`.** E2's story named the dashboard and missed
  them, so a second admin saw no lock/unlock or itinerary controls, and a demoted
  creator still saw controls the server would refuse. All five now read
  `trips.myRole`. **A grep for the concept, not just the symbol, would have
  caught it** — the same lesson E1 recorded about the route string.
- The in-flight guard could not be demonstrated with no AI key configured: the
  "analysis" fails and returns in under a millisecond, so two concurrent requests
  never overlap. Verified instead against a slow endpoint, where it returns one
  200 and one 409.

## Out of scope

- Changing the model, the prompts or the output shape. `_core/llm.ts` pins
  `gemini-2.5-flash`; that stays.
- Cost reporting or per-user AI budgets.
- Caching model responses.
