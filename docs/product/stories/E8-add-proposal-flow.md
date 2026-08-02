# E8 — Add-proposal flow

- **Covers request items:** 15
- **Status:** Not started
- **Depends on:** E5 (`SectionCard` restructure), E2 (watchers cannot propose)

## Why

There are two ways to add a date proposal and they are different forms.

The trip details page has `QuickAddDates`, `QuickAddDestination` and
`QuickAddStay` (`TripDashboard.tsx:55-477`) — 420 lines of dialogs that duplicate
a subset of what the detail screens offer. `QuickAddStay` collects name, link and
price per night. The accommodations screen collects all of that plus bedrooms,
bathrooms, beds, parking, amenities, location, and URL import with a paste
fallback for blocked listings. A member who adds a stay from the dashboard gets
the thin version and no indication that the fuller one exists.

Two forms for one job drift. One of them will always be behind.

## Stories

### E8.1 — As a member, adding a proposal takes me to that section's screen with the add form open

**Acceptance criteria**

- [ ] The Add control in the dates section navigates to the dates screen with its
      add dialog already open.
- [ ] Same for places and for accommodations.
- [ ] Cancelling the dialog leaves me on the detail screen, not bounced back.
- [ ] Saving adds the proposal and leaves me on the detail screen with it visible.
- [ ] Going back reaches the trip details page with the new proposal shown.
- [ ] Reloading a URL with the add parameter reopens the dialog.
- [ ] Watchers see no Add control, on either page.

**Touches**

- `client/src/pages/TripDashboard.tsx:1213-1215`, `:1368-1373`, `:1508-1510` —
  the `addSlot` props that mount the three dialogs.
- `client/src/pages/TripDates.tsx`, `TripDestinations.tsx`,
  `TripAccommodations.tsx` — read a query parameter (`?add=1`) on mount and open
  the existing add dialog.

**Notes**

The app routes with `wouter`. `useSearch` reads the query string; keep the
parameter shape identical across the three screens.

Clear the parameter once the dialog opens, so a later back-navigation does not
reopen it unexpectedly.

Each detail screen already has an add dialog with its own open state — this hooks
into that, it does not build a new one.

### E8.2 — As a developer, there is one add form per proposal type

**Acceptance criteria**

- [ ] `QuickAddDates`, `QuickAddDestination` and `QuickAddStay` are deleted.
- [ ] `TripDashboard.tsx` no longer imports `dates.parseNatural`,
      `destinations.create` or `accommodations.create` for the add path.
- [ ] Nothing the quick dialogs offered is lost — anything they had that the
      detail screens lack is added there first.
- [ ] `TripDashboard.tsx` shrinks by roughly 420 lines.

**Touches**

- `client/src/pages/TripDashboard.tsx:55-477` — the three components.
- Their supporting state and mutations: `proposeDateMutation` (`:585`),
  `createDestMutation` (`:586`), `createAccMutation` (`:587`) are also used by the
  clone dialogs (`:942-997`), so they cannot simply be deleted.

**Notes**

Check the quick dialogs for anything the detail screens do **not** have before
deleting. `QuickAddDates` has the natural-language parser ("any of the last 2
weekends in September 2026") with a multi-result preview and an "Add All" button
(`:188-250`) — `TripDates.tsx` should be confirmed to have an equivalent, and given
one if not. Losing that would be a real regression.

The clone-and-edit dialogs (`:1862-1991`) stay on the dashboard for now; they are
a different flow and item 15 does not mention them.

## Open questions

None.

## Out of scope

- The clone-and-edit dialogs.
- Adding vibe board items or itinerary entries, which already live only on their
  own screens.
- Redesigning the detail screens' add forms.
