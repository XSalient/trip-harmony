# E5 — Trip page restructure

- **Covers request items:** 8, 10, 11, 14
- **Status:** Done — 2026-08-02
- **Depends on:** E2 (members card removal, role-aware controls), E6 (finalised
  counts for the summary)

## Why

`client/src/pages/TripDashboard.tsx` is 1,995 lines and renders every section
fully expanded, in a fixed order, with no summary. On a phone — which is what this
app is built for — reaching the itinerary means scrolling past every date
proposal, every place and every accommodation. The answer to "where are we with
this trip?" is not on the screen that is supposed to give it.

## Stories

### E5.1 — As a member, a summary at the top tells me where the trip stands

**Acceptance criteria**

- [x] A summary card is the first thing on the trip details page.
- [x] It shows the finalised dates, or "Not finalised" when there are none.
- [x] It shows the count of finalised places.
- [x] It shows the count of finalised accommodations.
- [x] It shows the count of planned itinerary days.
- [x] Each figure links to the section it summarises.
- [x] It renders correctly for a brand-new trip with nothing in it.

**Touches**

- `client/src/pages/TripDashboard.tsx` — new card above everything else.
- Itinerary data is **not** currently fetched by this page; add
  `trpc.itinerary.*` alongside the existing queries at `:555-599`.

**Notes**

The finalised counts depend on E6. Until multi-lock lands, `lockedDest` and
`lockedAcc` (`TripDashboard.tsx:697-699`) are single `find()` results — after E6
they are lists and the counts are their lengths. Build the card against the list
shape so it does not need rewriting.

"Planned itinerary dates" is the count of `itineraryDays` rows for the trip.

### E5.2 — As a member, the trip description sits below the summary, collapsed

**Acceptance criteria**

- [x] The description appears directly below the summary card.
- [x] It is collapsed by default and expands on activation.
- [x] A trip with no description shows a prompt to add one (admins) or nothing
      (everyone else).
- [x] Expanding it does not push the summary off screen.

**Touches**

- `client/src/pages/TripDashboard.tsx` — new section.

**Notes**

`trips.description` already exists (`drizzle/schema.ts:134`) and is settable at
creation (`CreateTrip.tsx`), but is displayed nowhere. Editing it is E7.

### E5.3 — As a member, every section collapses, so that the page fits on a phone

**Acceptance criteria**

- [x] Dates, places, accommodations, budget, vibe board, itinerary and AI referee
      are each collapsible.
- [x] The collapsed header still shows the section name and its at-a-glance state
      (count, pending-vote badge, finalised badge).
- [x] Open/closed state persists per section across a reload.
- [x] Collapsing does not lose the "View all details" link into the section's own
      screen.
- [x] Keyboard and screen-reader accessible: headers are buttons with correct
      expanded state.

**Touches**

- `client/src/components/ui/collapsible.tsx` — already vendored, do not modify.
- `client/src/pages/TripDashboard.tsx:479-547` — `SectionCard` grows open/closed
  state. Note it currently sets `onClick`/`onKeyDown` on the whole `Card` to
  navigate to the detail page (`:1217-1222`, `:1375-1379`, `:1512-1516`) — a
  header that toggles cannot also navigate on click. Resolve that deliberately:
  header toggles, "View all details" navigates.
- Persist per section under one `localStorage` key, e.g.
  `trip:<id>:sections`.

**Notes**

`accordion.tsx` is also vendored, but accordion semantics allow only one open
section at a time; independent collapsibles are what is wanted.

### E5.4 — As a member, sections are named and ordered the way I think about the trip

**Acceptance criteria**

- [x] "Destinations" reads **Places** everywhere in the UI.
- [x] "Stays" reads **Accommodations** everywhere in the UI.
- [x] The order top to bottom is: Summary · Trip Description · My Trip Preferences
      · Dates · Accommodations · Places · Budget · Vibe Board · Itinerary ·
      AI Referee.
- [x] Section headings, empty-state text, dialog titles and toasts all use the new
      words.
- [x] Routes, tRPC procedure names and table names are unchanged.

**Touches**

- `client/src/pages/TripDashboard.tsx` — the section blocks move; `:1363`
  (`title="Destinations"`), `:1503` (`title="Stays"`) and their empty-state
  strings at `:1374` and `:1511`.
- `client/src/pages/TripDestinations.tsx`, `TripAccommodations.tsx` — page titles
  and copy.
- `client/src/components/MobileNav.tsx` — check for the old labels.

**Notes**

**UI copy only.** `/trips/:id/destinations`, `trpc.destinations.*` and the
`destinations` table keep their names. Renaming those means a migration, a router
rename and every call site — a separate piece of work with real risk and no user
benefit. If it is wanted later it deserves its own story.

Note the collision this creates: the app now has "Accommodations" as a section
name while `TripAccommodations.tsx` already existed under that name. That is fine,
but check that no copy now reads "Accommodations" where it means the old "Stays"
shorthand in a sentence that no longer parses.

### E5.5 — As a developer, the trip page is small enough to work on

**Acceptance criteria**

- [x] `SectionCard` lives in `client/src/components/trip/SectionCard.tsx`.
- [x] The proposal row renderers (dates, places, accommodations) are extracted
      into their own components.
- [x] `TripDashboard.tsx` is under 800 lines.
- [x] No behaviour changes in this story — it is a move.

**Touches**

- `client/src/components/trip/` — new directory.
- `client/src/pages/TripDashboard.tsx:55-547` — `QuickAddDates`,
  `QuickAddDestination`, `QuickAddStay`, `SectionCard`.

**Notes**

Do this **before** E5.1–E5.4, not after. The file cannot absorb this epic plus
E6's lock controls at 2,000 lines and stay reviewable.

The three `QuickAdd*` components are deleted outright by E8, which replaces them
with navigation to the detail screens. If E8 is close behind, move `SectionCard`
and the row renderers only and leave the dialogs to be deleted rather than moved.

## Open questions

- ~~Should sections default to collapsed or expanded on first visit?~~ Answered
  by the owner: **summary expanded, description and everything else collapsed**
  — one step tighter than the proposal here, which had the description open too.

## What it cost

E5.5 said "under 800 lines" and the page reached 1,146 with the six edit and
clone dialogs still inline — three "Edit X" and three "Clone X", each with its
own open flag, field state and save handler. They collapsed into one
`useProposalDialogs` describing a form rather than rendering six, which is what
took the page to 700.

The `SectionCard` empty state is the one place a mechanical extraction changed
behaviour: `{rows.length > 0 ? rows.map(...) : null}` became `{rows.map(...)}`,
and an empty array is truthy, so "No places yet" stopped rendering. The card now
counts its rendered children instead.

## Out of scope

- Renaming routes, routers or database tables.
- Redesigning the detail screens themselves.
- `DashboardLayout.tsx` — scaffold from the project template; no route renders it.
