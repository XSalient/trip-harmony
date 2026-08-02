# E7 — Editing and preferences summary

- **Covers request items:** 12, 13
- **Status:** Not started
- **Depends on:** E2 (`requireTripRole` for the edit permission)

## Why

Two gaps that are small individually and both about the same thing — the app
collects information and then will not show it back to you or let you change it.

A trip's name and description are set once at creation and are then permanent;
there is no edit path anywhere in the UI, even though the API accepts both.

`TripPreferences.tsx` opens on four empty textareas. A member who set their budget
cap and filled this in last week comes back to the same blank-looking form with no
indication of what they already told the group.

## Stories

### E7.1 — As a member, my preferences screen opens with a summary of what I have already said

**Acceptance criteria**

- [ ] A summary card sits above the four preference sections.
- [ ] It shows my budget cap for this trip, or a prompt to set one.
- [ ] I can set or change my budget cap from here.
- [ ] It shows whether my preferences are saved and when they were last updated.
- [ ] It shows how many members have submitted, out of how many.
- [ ] It renders sensibly for a member who has set nothing.

**Touches**

- `client/src/pages/TripPreferences.tsx:151-184` — the existing header card grows
  into the summary, or is replaced by it.
- The page already fetches everything needed: `preferences.getMy` (`:78`),
  `preferences.countForTrip` (`:82`) and `trips.members` (`:86`). The budget cap
  is `tripMembers.budgetMax`, returned by `trips.members`, and writable via
  `trips.updateMemberBudget` (`server/routers/trips.ts:146`).
- `memberPreferences.updatedAt` (`drizzle/schema.ts:344`) gives the last-updated
  time; check `db.getMyTripPreferences` (`server/db.ts:1403`) returns it.

**Notes**

The existing header card at `:151` already carries the trip name and the
`x/y members submitted` badge, so this is largely a restructure of what is there
plus the budget figure. It should read as "here is what you have told the group",
not as a second form.

Budget cap is per member per trip and is currently only editable from the budget
screen — surfacing it here is the point of the story, not a duplicate.

### E7.2 — As an admin, I can rename a trip and edit its description

**Acceptance criteria**

- [ ] An edit action is reachable from the trip details page.
- [ ] It edits the trip name and the description.
- [ ] The new name appears immediately in the page header, the trips list and the
      browser tab.
- [ ] Only admins can edit; tripmates and watchers see no edit control and are
      rejected by the API if they call it directly.
- [ ] An empty name is rejected with a clear message.
- [ ] The edit is recorded in the activity trail (E3).

**Touches**

- `server/routers/trips.ts:88-115` — `update` **currently has no authorisation
  check at all**: any signed-in user can rename any trip, change its phase, its
  status, its currency and its budget. Add `requireTripRole(id, ctx.user.id,
"admin")` from E2.1. This is a live authorisation hole, not just a
  prerequisite for the edit UI.
- `client/src/pages/TripDashboard.tsx` — the edit dialog and its trigger.
- The description display lands in E5.2; this story makes it editable.

**Notes**

The mutation already accepts `name` and `description` and validates them with Zod
(`name: z.string().min(1).max(255)`), so the server-side work is the permission
check. Note the input takes `phase`, `status`, `currency` and `totalBudget` too —
this story does not expose those in the edit dialog, but the permission check
covers them all, which is most of its value.

Where the trigger goes depends on E5: the trip details header already carries the
members icon after E2.4. A pencil beside the trip name in the summary card is the
natural home.

## Open questions

None.

## Out of scope

- Changing a trip's currency or total budget from this dialog. They are in the
  same mutation but belong with the budget screen.
- Cover images. `trips.coverImage` exists in the schema and is used nowhere.
- Deleting or archiving a trip.
