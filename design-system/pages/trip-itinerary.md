# Trip Itinerary

**Route:** `/trips/:id/itinerary`
**Source:** `client/src/pages/TripItinerary.tsx` (298 lines)
**Tier:** 3 — day-by-day plan.

## Current problems

- A **native `<select>`** for item type at `:263` — visually alien to every other control in the app. `ui/select` is unused.
- Collapse is a `collapsedDays` Set plus raw `<button>` chevrons at `:189-196`; `ui/collapsible` is unused.
- Delete buttons are bare `<button>`s at `:193` and `:218`.
- `TYPE_COLORS` / `TYPE_LABELS` are hardcoded maps.
- Items are flat `bg-muted/40` rows with no sense of time passing.

## Layout (mobile, top → bottom)

1. **Header** — back + "Itinerary". Right: overflow (Add day, when organiser).
2. **Day rail** — a horizontally scrolling date strip: one pill per day (weekday over day-number), the active day filled with `--primary`. Tapping scrolls to that day. Scrolls in its own container.
3. **Days** — one `SectionCard collapsible` per day:
   - Header: weekday and date (tabular), item count, day cost total right-aligned.
   - **Timeline body** — a vertical rule down the left with a node per item:
     - Time in tabular numerals at the node.
     - Type icon in a `--cat-*` tinted tile (type → hue via `lib/taxonomy.ts`).
     - Title as `subtitle`; description below, clamped to two lines.
     - Location and cost as `meta` chips; an external-link chip when present.
     - Overflow menu for Edit / Delete; Delete confirms.
   - Footer: a dashed "Add item" row, full-width, ≥44 px.
4. **Add / Edit item** — `BottomSheet`: time, title, type (`ui/select`, replacing the native one), description, location, cost, link.

## Components

`SectionCard` (collapsible), `BottomSheet`, `Select`, `StatusPill`, `EmptyState`, `PageGrid`.
Type labels, icons and hues come from `lib/taxonomy.ts`; times and money through `lib/format.ts`.

## States

- **Loading** — two day skeletons with three timeline nodes each.
- **No days** — `EmptyState` with a CalendarDays icon: "No days planned yet" + "Add a day" (organiser) or an explanatory line (member).
- **Day with no items** — an inline dashed "Nothing planned — add the first thing" row inside the day card.
- **Untimed item** — sorts to the end of the day under a "Any time" subhead rather than showing a blank time.

## Motion

- Day expand/collapse animates height with `--motion-base`.
- Timeline nodes stagger 30 ms as a day opens.
- Scrolling the day rail smooth-scrolls the matching day into view.

## Responsive

- **≥768** — days stay full-width; the timeline gains a wider time gutter.
- **≥1024** — `PageGrid` 2-column: day rail plus totals left, the timeline right.

## Deviations from MASTER

- The only screen with a timeline treatment and a horizontal day rail.
- Item type is taxonomy, so it uses `--cat-*` — never the status scale, even for a "cancelled" item.
