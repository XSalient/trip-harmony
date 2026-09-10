# Notifications

**Route:** `/notifications`
**Source:** `client/src/pages/Notifications.tsx` (123 lines)
**Tier:** 2 — a permanent bottom-nav destination, so it is seen constantly.

## Current problems

- `typeIcons` / `typeColors` at `:20-33` are the single densest cluster of raw palette classes in the app (`bg-blue-100 text-blue-700`, `bg-purple-100`, `bg-red-100`, `bg-green-100`, `bg-yellow-100`).
- The whole card is `onClick` with **no `role="button"`, no `tabIndex`, no keyboard handler** — unlike TripDashboard's cards, which do add them. Keyboard and screen-reader users cannot activate a notification.
- A flat undifferentiated list: no grouping, no read/unread separation beyond a dot.
- No way to act on a notification without navigating away.

## Layout (mobile, top → bottom)

1. **Header** — "Notifications" as a large title. Right: "Mark all read", shown only when unread > 0.
2. **Filter row** — a `ChipPicker` of All / Unread / Votes / Budget. Horizontally scrollable.
3. **Grouped list** — date subheads (Today, Yesterday, Earlier), then rows:
   - Type icon tile in the matching `--cat-*` soft surface, resolved via `lib/taxonomy.ts`.
   - Title as `subtitle` (weight 600 while unread, 500 once read).
   - Message clamped to two lines.
   - Relative timestamp as `caption`, tabular.
   - Unread marker: a `--primary` dot **and** the heavier title weight, so it is not colour-only.
   - The row is a real `<button>` spanning the full width, ≥64 px tall, with a visible focus ring.
   - Swipe-left reveals "Mark read"; the same action is always available in an overflow menu, because gesture is never the only route.
4. **Inline actions** — a vote-request notification carries a `VoteControl layout="icon" size="sm"` so the user can vote without leaving the screen. This is the highest-value change on this screen.

## Components

`ChipPicker`, `StatusPill`, `EmptyState`, `VoteControl`, `Skeleton`, `PageGrid`.
Types resolve through `lib/taxonomy.ts`.

## States

- **Loading** — five row skeletons.
- **Empty (no notifications)** — `EmptyState` with a Bell icon: "You're all caught up".
- **Empty (filter matches nothing)** — a distinct message naming the filter, plus a "Clear filter" action. Never the same copy as the true empty state.
- **Marking read** — optimistic; the badge in the tab bar decrements immediately.

## Motion

- Rows stagger 30 ms.
- A row marked read cross-fades its weight and dot out over `--motion-fast`.
- Swipe tracks the finger in real time.

## Responsive

- **≥768** — rows stay full-width; measure capped.
- **≥1024** — `PageGrid` 2-column: filters and counts left, list right.

## Deviations from MASTER

- The only screen embedding a `VoteControl` outside a `ProposalCard`.
- Rows are taller than the standard list row (≥64 px) because they carry three lines.
