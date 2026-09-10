# Home — Dashboard (logged in)

**Route:** `/` when `isAuthenticated === true`
**Source:** `client/src/pages/Home.tsx` → `Dashboard`
**Tier:** 1 — the authenticated landing surface; the "Home" tab destination.

## Current problems

- `AppShell title="Hi, {firstName}"` puts the greeting in a 56 px bar with a logout icon jammed beside it.
- Two quick-action buttons in a 2-up grid, then an unstyled trip list — no sense of priority or "what needs me".
- `phaseLabels` / `phaseColors` maps at `Home.tsx:70-85` hardcode `bg-green-100 text-green-700`.
- Loading spinner at `Home.tsx:196` is a raw `border-2 animate-spin` div; `ui/spinner` exists and is unused.
- Empty state is a bespoke dashed card — one of eight such copies.

## Layout (mobile, top → bottom)

1. **Large-title header** — "Hi, {firstName}" as `title-lg`, collapsing to a compact `title` bar on scroll. Right side: avatar button opening a menu (Travel DNA, Theme, Sign out). Logout is *not* a bare icon in the header — destructive actions belong behind the menu, spatially separated.
2. **Attention row** — a horizontal `StatCard` pair, only rendered when non-zero:
   - "N votes waiting" → `tone="warning"`, deep-links to the first trip needing votes.
   - "Travel DNA incomplete" → `tone="info"`, links to `/quiz`.
   This replaces the current always-on nudge card, so a caught-up user sees a clean screen.
3. **Your trips** — section heading with a count, then a vertical list of trip cards:
   - Cover band tinted from the trip's phase.
   - Trip name (`subtitle`), destination and date range (`body-sm`, tabular numerals).
   - `AvatarStack` of members, max 4 plus overflow.
   - `StatusPill` for phase; a `--success` pill when finalised.
   - A thin phase progress track (Dates → Destination → Stay → Booked).
   - Whole card is one tap target with `role="button"`, `tabIndex`, and Enter/Space handling.
4. **FAB** — "New trip", floating above the tab bar, `--primary`, pill, ≥56 px.

## Components

`StatCard`, `AvatarStack`, `StatusPill`, `EmptyState`, `Skeleton`, `PageGrid`, `Button`.
Phase labels and colours come from `lib/taxonomy.ts`, not a local map.

## States

- **Loading** — three trip-card skeletons matching the real card's geometry, so nothing shifts on arrival.
- **Empty** — `EmptyState` with a Compass icon: "No trips yet" / "Start one and invite your group." + primary CTA. Replaces the dashed card.
- **Error** — inline retry card; never a blank screen.

## Motion

- Trip list staggers in 40 ms per card, capped at 8.
- Card press: `scale: 0.97`, spring.
- Header title cross-fades between large and compact as it collapses.

## Responsive

- **≥768** — trips 2-up.
- **≥1024** — `PageGrid` 2-column: attention row plus trips left, a "recent activity" rail right.

## Deviations from MASTER

None.
