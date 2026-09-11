# Trip Dashboard

**Route:** `/trips/:id`
**Source:** `client/src/pages/TripDashboard.tsx` (1085 lines → split into `pages/TripDashboard/`)
**Tier:** 1 — the app's centre of gravity; every trip route funnels through it.

## Current problems

The single worst file in the codebase.

- 1085 lines, ~35 `Dialog`s, three duplicated inline voting sections.
- Vote buttons are raw `<button>`s with hand-mapped active classes at `:762`, `:833`, `:907`.
- Member avatars are raw initials divs at `:605-618`; `ui/avatar` is unused.
- Vote counts render as literal glyphs — `{loves}❤ {fines}✓ {vetos}✗` at `:821-823` and `:895-897`. Emoji as icons.
- A hand-rolled tab switcher at `:81-88` while the sibling `TripDates` page uses real `Tabs` for the same job.
- 36 raw palette classes — the highest count anywhere.
- `SectionCard` is a bespoke composite (`:224-271`).

## Layout (mobile, top → bottom)

1. **Trip header** — large title (trip name), collapsing on scroll. Subtitle: destination plus locked date range, tabular numerals. Right: overflow menu (Invite, Preferences, Edit, Leave/Delete — destructive last and separated by a divider).
2. **Trip pulse** — one full-width card:
   - `AvatarStack` of members with an "Invite" affordance appended as a dashed +N tile.
   - Four-step phase tracker (Dates → Destination → Stay → Booked) with the current step marked by _both_ colour and a filled dot plus label.
3. **Needs you** — rendered only when non-zero. A `StatCard tone="warning"` per outstanding section: "3 dates need your vote". Tapping scrolls to that section. This replaces the current always-visible orange alert card.
4. **Planning sections** — three `SectionCard`s (Dates, Destinations, Stays). Each:
   - Icon tile, title, count, and a `StatusPill tone="success"` reading "Locked" when settled.
   - Up to three `ProposalCard density="condensed"` rows — the _same_ component the detail pages use at `density="full"`.
   - A `VoteBar` per row plus `VoteControl layout="icon"`.
   - Footer: "View all N" link and a "+ Add" action opening a `BottomSheet`.
   - `collapsible`, defaulting open, remembering state per section.
5. **Secondary rows** — Budget, Vibe Board, Itinerary, AI Referee as `StatCard`s with a value summary (spend to date, item counts) rather than bare navigation rows.
6. **Invite sheet** — replaces the current header dialog: a copy-link block with a real copy button and confirmation, a divider, and an email field.

## Components

`ProposalCard` (condensed), `VoteControl`, `VoteBar`, `SectionCard`, `StatCard`, `StatusPill`, `AvatarStack`, `BottomSheet`, `EmptyState`, `PageGrid`.
All three vote handlers collapse into `useProposalVote`.

## States

- **Loading** — header plus three section skeletons; never a full-page spinner.
- **Empty per section** — `EmptyState size="sm"` inside the `SectionCard`, with the add action as its CTA.
- **Not a member / 404** — a full-screen state reusing the shared status pattern.

## Motion

- Sections stagger in 40 ms.
- Collapsing a section animates height with the `--motion-base` spring.
- A cast vote pulses the `VoteBar` segment once (scale 1 → 1.04 → 1) and updates optimistically.

## Responsive

- **≥768** — secondary rows go 2-up.
- **≥1024** — `PageGrid` 2-column: planning sections left, pulse plus secondary rows right.

## Deviations from MASTER

- The only screen that uses `ProposalCard density="condensed"`.
- Split into a folder: `index.tsx` for data and composition, with the section blocks and sheets as co-located siblings. **The split lands as its own commit, before any visual change.**
