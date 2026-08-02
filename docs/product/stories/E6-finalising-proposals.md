# E6 — Finalising proposals

- **Covers request items:** 9, 16
- **Status:** Done
- **Depends on:** E2 (only admins may finalise)

## Why

A trip has one set of dates but usually more than one destination and more than
one place to sleep — a week in Spain is Barcelona _and_ Girona, with two
different apartments. The app cannot express that: `selected` is treated as "the
chosen one" for all three proposal types, and the database enforces it by clearing
every other row before setting one.

Finalising is also buried. It happens on the detail screens; the trip details page
shows a static padlock glyph that tells you a decision was made but offers no way
to make or undo one.

## The rule

| Proposal type      | Locks       |
| ------------------ | ----------- |
| **Dates**          | Exactly one |
| **Places**         | Many        |
| **Accommodations** | Many        |

Locking and unlocking are **admin** actions. (The request says "trip moderator";
this uses **admin**, consistent with E2 and the rest of the product vocabulary.)

## Stories

### E6.1 — As an admin, I can lock several places and several accommodations

**Acceptance criteria**

- [x] Locking a place leaves other locked places locked.
- [x] Locking an accommodation leaves other locked accommodations locked.
- [x] Unlocking one leaves the rest alone.
- [x] Locking a date proposal still clears any other locked date — exactly one.
- [x] Every screen that displays "the finalised place / accommodation" displays
      all of them.
- [x] A locked proposal cannot be edited or deleted while locked.
- [x] Tripmates and watchers cannot lock or unlock.

**Touches**

- `server/db.ts:770-782` (`selectDestination`) and `:890-905`
  (`selectAccommodation`) — **both currently run an UPDATE clearing `selected` for
  the whole trip before setting one row.** Both become a per-row set. Keep
  `deselectDestinations` / `deselectAccommodations` for a "clear all" action.
- `server/db.ts:622-634` (`selectDateProposal`) — correct as-is, leave it.
- `server/routers/destinations.ts`, `accommodations.ts:154-170`, `dates.ts` —
  `select` / `deselect` procedures; add the admin check.
- **Every reader of `selected` as a singular:**
  - `client/src/pages/TripDashboard.tsx:697-699` — `lockedDate`, `lockedDest`,
    `lockedAcc` via `find()`. The last two become filters.
  - `TripDashboard.tsx:1101-1119` — the "dates, destination, stay decided" text
    and the three status dots.
  - `TripDashboard.tsx:1206-1211`, `:1362-1366`, `:1502-1506` — `locked` prop on
    each `SectionCard`.
  - `client/src/pages/TripDestinations.tsx:80-81,227,302` and
    `TripAccommodations.tsx:132-133,464,544` — the select/deselect UI.

**Notes**

This is the highest-risk change in the programme, because the breakage is silent:
a `find()` that used to return the only locked row now returns an arbitrary one,
and the page still renders. Change the db helpers and every reader in **one
commit**. A grep for `selected` across `client/src/pages` and `server` is the
checklist.

`TripDates.tsx:582,712` ("Locked" badge, "Lock this" button) is the existing
single-lock UI and is the pattern the other two should follow — extended to a
toggle.

### E6.2 — As an admin, I can lock and unlock from the trip details page

**Acceptance criteria**

- [x] Each proposal row on the trip details page has a lock/unlock control beside
      its name.
- [x] The control shows current state at a glance: locked vs not.
- [x] Non-admins see the state but no control, and the state is not interactive
      for them.
- [x] Activating it updates immediately and reconciles with the server.
- [x] It works in a collapsed section's preview rows and in the expanded section
      (E5).
- [x] Locking from here has the same effect as locking from the detail screen.

**Touches**

- `client/src/pages/TripDashboard.tsx:1267-1269` (dates), `:1411-1413` (places),
  `:1553-1555` (accommodations) — each renders a static `Lock` glyph when
  `selected`. These become the control.
- The same rows already gate a `DropdownMenu` on `canManage && !p.selected`
  (`:1276`, `:1420`, `:1562`) — `canManage` is currently
  `proposedBy === user.id || isOrganizer`. Locking is admin-only regardless of
  authorship, so it needs its own check, not `canManage`.

**Notes**

The page already does optimistic updates for votes via `utils.<router>.list.setData`
(`TripDashboard.tsx:709-722` and the two after it). Follow that pattern for the
lock toggle rather than inventing a second approach.

### E6.3 — As a member, I can see who finalised something and when

**Acceptance criteria**

- [x] `lockedBy` and `lockedAt` are recorded when a proposal is locked and cleared
      when it is unlocked.
- [x] The proposal detail screens show "Finalised by <name> · <when>".
- [x] The summary card (E5.1) can attribute the finalised dates.
- [ ] Locking and unlocking are recorded in the activity trail (E3).
      **Deferred — E3 has not been built.** Pick this up with E3.1.
- [x] Watchers see that something is finalised but not by whom.

**Touches**

- `drizzle/schema.ts` — `lockedBy` and `lockedAt` on `dateProposals` (`:170`),
  `destinations` (`:201`) and `accommodations` (`:234`).
- A migration adding the six columns.
- `server/db.ts` — set them in the select/deselect helpers.

**Notes**

Keep the `selected` boolean rather than deriving lock state from `lockedAt` being
non-null. Two sources of truth for the same fact is how they drift; `selected` is
already indexed by every query and every reader.

## Open questions

1. **What does a section header say when several are locked?** **Resolved as
   proposed:** "2 finalised" for places and accommodations, and "Decided" kept
   for dates, where exactly one is possible. `SectionCard` takes a
   `lockedCount` and a `singleLock` flag rather than a boolean.
2. **Should a locked proposal still be votable?** **Current behaviour kept** —
   the vote buttons are hidden on a finalised proposal, and voting on the
   remaining options is unaffected. Revisit if the group ever wants to register
   dissent against something already decided.

**Found during implementation**

- The rename from `select`/`deselect` to `lock`/`setLock`/`unlock` was the
  safety net that made this change survivable. The compiler pointed at all three
  detail pages the moment the procedures changed name; had the names stayed the
  same, `find(x => x.selected)` would have kept compiling and kept returning an
  arbitrary one of several finalised rows. **Rename the thing whose meaning
  changed.**
- `TripDestinations` and `TripAccommodations` had no `trips.members` query, so
  "Finalised by …" had no way to resolve a name. Added to both.
- The attribution line is one shared component
  (`client/src/components/trip/FinalisedBy.tsx`) rather than three copies, so
  the three screens cannot describe the same fact differently.

## Out of scope

- Automatic locking based on vote thresholds.
- Booking, payment or anything that treats a lock as a commitment beyond the app.
- Locking vibe board items or itinerary entries.
