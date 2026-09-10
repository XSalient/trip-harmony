# Trip Accommodations

**Route:** `/trips/:id/accommodations`
**Source:** `client/src/pages/TripAccommodations.tsx` (810 lines)
**Tier:** 2 — the richest detail screen, and the stress test for `ProposalCard`.

## Current problems

- 810 lines, 19 raw palette classes.
- The AI-match panel at `:640-723` is a raw `<button>` plus a conditional div; both `ui/collapsible` and `ui/accordion` exist unused.
- Score pills are inline ternary class strings at `:656-660` and `:689-693`.
- Raw `<img>` with the `onError` `display:none` hack at `:535`.
- The add form (`:370-511`) is a 140-line centred dialog containing URL auto-fill, a 6-field rooms grid, two switches, amenities, and a free-text AI preference parser. On a 390 px screen this is unusable as a modal.

## Layout (mobile, top → bottom)

1. **Header** — back + "Stays", overflow menu (Unlock).
2. **Preferences nudge** — shown only when the member has not set preferences: `StatCard tone="info"`, "Add your preferences so the AI can match you", linking to `/trips/:id/preferences`. Dismissible.
3. **Stay list** — `ProposalCard density="full"`:
   - **Media** — 16:9 cover, aspect reserved, tinted fallback tile.
   - Name as `subtitle`; location as `meta`.
   - **Price block** — per-night and total, tabular numerals, right-aligned, price-per-person derived and shown as the smaller line since that is the number the group actually argues about.
   - **Room stats** — an icon chip row (beds, baths, bedrooms) using `icon-sm` plus tabular counts; horizontally scrollable in its own container, never wrapping raggedly.
   - Amenity `StatusPill`s, capped at four with a "+N" overflow chip.
   - **AI Match panel** — a `SectionCard collapsible` (not a raw button):
     - Fit score as a `StatCard`-style figure with a `tone` and an explicit label.
     - Per-member breakdown rows: `AvatarStack` entry, a fit bar, one line of reasoning.
     - Refresh action.
     - While the analysis is running: a skeleton with "Analysing in the background…", not a dashed placeholder.
   - `VoteBar` + `VoteControl scale={PREFERENCE_SCALE}`.
   - Overflow menu; organiser "Select this stay"; `ProposalComments` footer.
4. **Add / Edit** — a **tall** `BottomSheet` with the long form split into three `SectionCard`s: *Paste a link* (URL auto-fill, the primary path), *Details* (name, description, image, price), *Rooms and amenities* (the grid, switches, amenities). A `StickyActionBar` holds Cancel/Save so the primary action is always reachable.

## Components

`ProposalCard`, `VoteControl`, `VoteBar`, `SectionCard` (collapsible), `StatCard`, `StatusPill`, `AvatarStack`, `BottomSheet`, `StickyActionBar`, `EmptyState`, `ProposalComments`, `PageGrid`.

## States

- **Loading** — three media-card skeletons.
- **Empty** — `EmptyState` with a Home icon + "Add a stay".
- **URL auto-fill in flight** — the URL field shows an inline spinner; the rest of the form stays editable.
- **AI analysis pending** — per-card skeleton inside the collapsed panel.
- **Broken image** — tinted fallback tile.

## Motion

- The AI-match panel expands with a height spring; the fit bars fill left-to-right on first reveal, staggered 30 ms.
- Sheet springs from the bottom.

## Responsive

- **≥768** — 2-up; the AI panel stays full-width inside its card.
- **≥1024** — `PageGrid` 2-column; the add form becomes a centred dialog (`BottomSheet` switches variant at `md`).

## Deviations from MASTER

- The only screen with a `size="tall"` sheet and a `StickyActionBar` inside a sheet.
- The only screen where a card holds a nested collapsible section.
