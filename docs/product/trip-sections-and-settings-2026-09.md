# Trip settings: hiding the sections a trip does not need

**Status:** built and shipped 2026-09-09. Written 2026-09-07 as a design brief
against the app as it stood before the change, and kept because it holds the
reasoning the code cannot: what was considered and rejected, and why item 3 is
not here. **Its file:line references describe the code before this landed** — use
them to follow the argument, not to navigate. The decisions that outlived it are
in [ADR-0025](../adr/0025-a-hidden-section-is-a-display-preference.md) and
[the changelog](../CHANGELOG.md).

The ask was three things:

1. Let an admin hide any section on the trip page, from a new **Trip settings**
   menu item — because not every trip needs every section, and a one-day trip
   does not need accommodation voting.
2. Stop the **Add** button displacing the collapse chevron when a section is
   expanded.
3. A new section for people going by private car — where to park, and who is
   going with whom.

Item 3 was **declined by the requester** after the options were put to them; the
reasoning and the research are in section 4 so nobody re-derives them. Items 1
and 2 shipped as specified below, with one deviation, noted in 2.4:
`SectionOffNotice` renders its own `AppShell` and asks for the caller's role
itself, rather than six screens each destructuring a capability they otherwise
do not use.

---

## 1. Where the problem actually is today

Every row was checked against the code, not assumed.

| #   | Fact                                                                                                                                                                                                                         | Where                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | The trip page's sections are a hardcoded TS union of eight keys, and eight literal JSX blocks. There is no data behind them at all.                                                                                          | `client/src/components/trip/useSectionState.ts:11-19`, `client/src/pages/TripDashboard.tsx:503-773` |
| 2   | `useSectionState` remembers what is **collapsed**, in `localStorage` under `trip:${tripId}:sections`. That is per-person and per-device — not a decision the trip has made.                                                  | `client/src/components/trip/useSectionState.ts:24-55`                                               |
| 3   | Nothing in the schema is a per-trip feature flag except `votingUnit`. There is no settings table and no settings screen.                                                                                                     | `drizzle/schema.ts:180-197`                                                                         |
| 4   | The trip's ⋮ menu has exactly three items — Edit, Duplicate, Delete — and none of them navigates to a route. It is rendered only when `canAdminister`.                                                                       | `client/src/components/trip/TripActionsMenu.tsx:101-117`, `TripDashboard.tsx:461-467`               |
| 5   | The AI Referee is fed `dataGaps` and the prompt tells it they are "not optional context" and must be reported under **What's missing**. On a trip with no budget it says so, every time, whether or not the group wants one. | `server/prompts/referee.ts:442-449`, and the prompt at `:507` and `:520`                            |
| 6   | In `SectionCard`'s header the chevron sits **inside** the toggle button and `addSlot` is appended **after** it. Collapsed, the chevron is right-most; expanded, Add takes the right edge and the chevron is pushed inward.   | `client/src/components/trip/SectionCard.tsx:116-149`                                                |

Item 6 is the whole of complaint 2: the control you just used to open a section
is no longer where you left it, and the thumb that opened it now lands on Add.

The eight sections today, in render order: `summary` (`TripSummary`),
`description`, `preferences`, `dates`, `accommodations`, `suggestions`, `budget`,
`referee`. Members is not a section — it is a header icon linking to
`/trips/:id/members`.

---

## 2. Hiding sections — the design

### 2.1 The section list becomes shared

`SectionKey` is a union in a client hook. The server has to validate the keys it
stores, so it moves to a new **`shared/sections.ts`**:

```ts
export const TRIP_SECTIONS = [
  { key: "summary", label: "Summary", hideable: false },
  { key: "description", label: "Trip description", hideable: true },
  { key: "preferences", label: "My trip preferences", hideable: true },
  { key: "dates", label: "Dates", hideable: true },
  { key: "accommodations", label: "Accommodations", hideable: true },
  { key: "suggestions", label: "Suggestions", hideable: true },
  { key: "budget", label: "Budget", hideable: true },
  { key: "referee", label: "AI Referee", hideable: true },
] as const;

export type SectionKey = (typeof TRIP_SECTIONS)[number]["key"];
export const HIDEABLE_SECTION_KEYS: SectionKey[] = /* filtered */;

/** Defensive: unknown keys are dropped, a bad blob reads as "nothing hidden". */
export function parseHiddenSections(raw: string | null | undefined): SectionKey[];
```

`summary` is deliberately not hideable. It is the page's at-a-glance state, and a
trip with everything switched off would otherwise render a blank page.

`parseHiddenSections` copies the shape of the existing JSON-out-of-`text` parse at
`server/db.ts:3231-3243` — `try`/`catch`, returning empty rather than throwing.
`useSectionState.ts` drops its local union and imports the type.

**Collapsed and hidden stay separate concepts.** One is per-person per-device and
already works; the other is per-trip and shared. Do not merge them.

### 2.2 Storage: one nullable column on `trips`

In `drizzle/schema.ts:180-197`, after `votingUnit`:

```ts
/** Section keys this trip has switched off, as a JSON array. Null = none. */
hiddenSections: text("hiddenSections"),
```

`text` and not `jsonb`, because **the schema has no `jsonb` anywhere** — the
imports at `drizzle/schema.ts:1-13` do not include it, and every JSON value in the
app is `JSON.stringify`d into `text`: `activityEvents.metadata` (`:435`),
`productEvents.metadata` (`:472`), `memberPreferences.attributes` (`:762`).

**Alternative considered and rejected:** a `trip_section_settings` row-per-fact
table, in the shape of `suggestion_dismissals` (`drizzle/schema.ts:784-792`).
It would need entries in `TRIP_OWNED_TABLES` (`server/db.ts:853`),
`deleteTripCascade` (`:878`) and `cloneTripContents` (`:971`), plus the two
structural tests that police them, to hold at most seven short strings that are
read with the trip row every time anyway. The cost of the blob is that it is
unqueryable — nobody is going to ask "which trips hide Budget", and if that
question ever arrives it is a product-events question, not a schema one.

Migration `drizzle/0020_trip_hidden_sections.sql`, produced by `pnpm db:generate`
and committed in the same commit (AGENTS.md rule 9):

```sql
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "hiddenSections" text;
```

Additive and nullable, so it is backward compatible with `master` — mandatory,
because preview and production share one database and preview deploys do not
migrate ([ADR-0023](../adr/0023-preview-and-production-share-one-database.md)).
No `ENABLE ROW LEVEL SECURITY` / `REVOKE` block: that applies to new tables
(`drizzle/0019_product_events.sql`), not new columns. Append the journal entry in
`drizzle/meta/_journal.json` at idx 20; snapshots stop at 0007, so follow the
existing hand-reconciled practice rather than expecting generate to be tidy.

### 2.3 Server

- **`server/db.ts`** — `setTripHiddenSections(tripId, keys)` beside `updateTrip`
  (`:833`). Writes `JSON.stringify(keys)` and bumps `updatedAt` by hand, as every
  other writer in the file does (there is no `$onUpdate` on the column).
- **`server/routers/trips.ts`**
  - `get` (`:26-37`) already derives `voterCount` in exactly one place so four
    screens cannot answer it differently. Derive `hiddenSections` the same way:
    return `parseHiddenSections(trip.hiddenSections)` so every caller receives an
    array and nobody parses the string a second time.
  - New `setHiddenSections: protectedProcedure`, input
    `{ tripId: number, hidden: z.array(z.enum(HIDEABLE_SECTION_KEYS)) }`, whose
    first line is `await requireTripRole(input.tripId, ctx.user.id, "admin")`.
    That is the **trip** admin on `trip_members.role` — not `adminProcedure`,
    which is the site-wide `users.role` and is documented as such at
    `server/routers/admin.ts:1-6`. Record
    `recordActivity({ action: "trip.edited", metadata: { fields: ["hiddenSections"] } })`,
    reusing the existing action rather than adding one to `ACTIVITY_ACTIONS`.
  - `clone` builds the new trip with an explicit column list; add
    `hiddenSections: source.hiddenSections`. The same trip run again wants the
    same sections off.
  - **No product event.** `PRODUCT_EVENTS` is a deliberate allow-list
    (`shared/productEvents.ts:29-41`); adding one means a field spec, a runbook
    update and a permanent contract, for measurement nobody has asked for.

### 2.4 Client

- **`client/src/pages/TripSettings.tsx`** (new) at `/trips/:id/settings`, lazily
  imported in `App.tsx:24-41` and routed at `:59-68` like every other trip screen.
  One shadcn `Switch` per hideable section, **on = visible**. Toggling sends the
  whole array to `trips.setHiddenSections` and invalidates `trips.get`. No
  optimistic update: [ADR-0021](../adr/0021-optimistic-updates-for-drag-and-drop.md)
  scopes optimism to direct-manipulation gestures and closes with "only those".
  Gate the controls on `useTripRole(tripId).canAdminister`; a non-admin who reaches
  the URL gets a read-only explanation, and the server refuses them anyway. The
  copy must say that hiding keeps the data.
- **`TripActionsMenu.tsx:101-117`** — a "Trip settings" item (`Settings2`) above
  "Edit trip", navigating to `/trips/${tripId}/settings`. No role prop needed: the
  menu is already only rendered when `isAdmin` (`TripDashboard.tsx:461`).
- **`TripDashboard.tsx`** — read `hiddenSections` off `trips.get`, define
  `const shows = (k: SectionKey) => !hidden.includes(k)`, and gate each of the
  eight blocks at `:519-773`. Also **remove hidden sections from `pendingVotes`
  and `totalPending` (`:192-218`)**, or the orange banner will say "You have 3
  unvoted proposals · Open a section below to vote" and point at a card that is
  not on the page.
- **`client/src/components/trip/TripSummary.tsx:107-146`** — the four `Line`s are
  hardcoded and each links to a section screen. Take the hidden set as a prop and
  drop the rows for hidden sections; a summary row that links to a turned-off
  screen is a dead end.
- **`client/src/components/trip/SectionOffNotice.tsx`** (new) — what a section's
  own screen renders instead of its body when that section is hidden:
  "Accommodations is turned off for this trip", plus a "Turn it on" link to
  settings for admins. Used by `TripDates`, `TripDestinations`,
  `TripAccommodations`, `TripBudget`, `TripReferee` and `TripPreferences`.
  Chosen over a redirect so that an old notification link or a URL shared in the
  group chat explains itself rather than silently bouncing somebody to the trip
  page.

### 2.5 The caveat that has to be written into the code

**Hiding a section is a display preference, not authorisation.** The tRPC
procedures still accept writes to a hidden section, by design: gating them would
put a check into every procedure in four routers and would break the moment an
admin switches the section back on. This belongs in a comment where it will be
read, because the next person to touch it will otherwise assume "hidden" is a
security boundary, and it is not.

### 2.6 The AI Referee

`server/prompts/referee.ts:401-450` assembles `dataGaps`, and the system prompt
tells the model they are "not optional context" (`:520`) and must be reported
under **What's missing** (`:507`). With Budget hidden, the referee will reliably
nag about a budget the group deliberately switched off — the exact complaint that
motivated this brief.

Fix it at the input rather than with five special cases: in
`server/routers/referee.ts`, drop the proposal lists for hidden sections before
calling `buildRefereeContext`, and pass the hidden set so those gap lines are
never pushed. A section the group turned off is not part of this trip's decision.

The cost, stated because it is real: a date that was finalised and _then_ hidden
disappears from the referee's view. That is acceptable — hiding is a deliberate
admin act — but it should not be discovered by surprise. Extend
`server/prompts/referee.test.ts` with a case per hidden section.

---

## 3. The Add button and the chevron

`client/src/components/trip/SectionCard.tsx:116-149`, and nothing else.

Pull `ChevronDown` out of the toggle `<button>` so the header is three siblings in
one flex row:

```
[ button: icon · title · badges ]  [ addSlot, when open ]  [ chevron ]
  flex-1, aria-expanded, onToggle                           onToggle
```

The chevron becomes its own `<button onClick={onToggle}>` carrying
`aria-hidden="true"` and `tabIndex={-1}`, so a pointer gains a stable right-edge
target while keyboard and screen-reader users still see exactly one control —
the same number they see today. Collapsed rendering does not change at all.
`AddProposalButton`'s `stopPropagation` (`:30-33`) stays; it is harmless now that
the button is not inside the toggle's subtree.

`CollapsibleRow` (`:178-222`) and `TripSummary` have no `addSlot`, so their
chevron is already right-most in both states. Leave them alone.

Verification is a new `client/src/components/trip/sectionCard.test.ts`, structural
in the style of `client/src/components/trip/dragDrop.test.ts` (there is no React
test renderer in this project, deliberately — see `vitest.config.ts`): assert the
chevron is rendered after `addSlot` in the source, that it carries `onToggle`, and
that `aria-expanded` appears exactly once.

---

## 4. Considered and declined: cars, seats and parking

The third request was a section for people travelling by private vehicle — who
drives, who rides with whom, and where to park.

**Declined by the requester**, in their words: _"It feels like now it's trip
planning instead of consensus."_ That is consistent with the app's own history —
the vibe board and the itinerary were removed on 2026-08-19 on the grounds that
this is not a travel planner, and Places was renamed Suggestions for the same
reason. Recorded here rather than lost, because the request will come back.

What the research found, so it is not repeated:

- **Nothing transport-shaped exists anywhere.** No table, enum, router, page,
  route, roadmap item or story mentions a car, driver, seat, vehicle or parking
  space. It would have been built from nothing.
- `accommodations.freeParking` and `camperParking` (`drizzle/schema.ts:620-621`)
  describe **the property**, not the group's cars. They are not a starting point.
- The right unit for a seat is **`trip_attendees`, not `trip_members`**
  (`drizzle/schema.ts:282-305`). Children and pets need seats and have no account;
  members-only seating would have silently under-counted every family.
- A car is structurally a `trip_groups` row with a capacity, and seating people is
  the same problem the Members screen already solves —
  `DraggableChip.tsx` (framer-motion pointer drag, deliberately not HTML5 DnD,
  which does not fire on mobile touch browsers), `mayAssign`/`mayMoveBetween`
  (`server/routers/groups.ts:54-80`), and the optimistic-update shape mandated by
  [ADR-0021](../adr/0021-optimistic-updates-for-drag-and-drop.md).
- Parking would have been the app's **first feature to want a real location**.
  The schema stores no coordinates at all; `accommodations.location` is a single
  `varchar(500)` free-text field (`drizzle/schema.ts:624`). `server/_core/map.ts`
  has geocoding and directions endpoints that **nothing calls** — using them would
  make `BUILT_IN_FORGE_API_URL`/`_KEY` a hard dependency of a core screen rather
  than an optional import path.
- Prior art (GoKid, MyCarpoolApp, Carpoolio, GroupCarpool) converges on the same
  four things: driver/rider visibility, seat capacity, departure times, and one
  place to talk. Note that **none of them is a voting problem** — which is exactly
  why it did not belong here.

If it is ever revived: one section, no voting, seats keyed on attendees, and a
"not in a car yet" pool as the header badge — that gap is the only part of it that
carries real information.

---

## 5. Open questions

- Should hiding a section that already has proposals warn first? The data
  survives, so the honest answer is probably a line of copy in Trip settings
  rather than a dialog.
- Should a hidden section still appear in `docs`-facing places like the demo seed?
  Currently irrelevant: null means nothing is hidden, so `pnpm seed:demo` is
  unaffected.

## 6. Out of scope

- Per-member section hiding. This is a trip-level decision made by an admin.
- Reordering sections. Different problem, and nobody has asked.
- Any change to what a section does once it is visible.
