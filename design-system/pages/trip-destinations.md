# Trip Destinations

**Route:** `/trips/:id/destinations`
**Source:** `client/src/pages/TripDestinations.tsx` (382 lines)
**Tier:** 2 — second screen redesigned; the structural clone of Dates on the *other* vote scale.

## Why it goes second

If Dates and Destinations both land without changing the `harmony/` API, the
shared layer is proven and the remaining screens are execution rather than design.

## Current problems

- Cover images are raw `<img>` at `:246` with an `onError` `display:none` hack — no aspect ratio reserved, so the card jumps on load (CLS).
- Vibe chips are `Badge onClick` used as toggles; `ui/toggle-group` is unused.
- Score colour is an inline ternary at `:261`.
- Scoring `reduce` at `:161` is duplicated in TripAccommodations.

## Layout (mobile, top → bottom)

1. **Header** — back + "Destinations", overflow menu.
2. **Context strip** — "N suggestions · sorted by group score".
3. **Destination list** — `ProposalCard density="full"`, media-led since this is the most visual screen:
   - **Media** — 16:9 cover, `aspect-ratio` reserved so nothing shifts, `--radius-xl`, lazy-loaded. On failure it falls back to a `--cat-*` tinted tile with a MapPin glyph — never a collapsed box.
   - Name as `subtitle`; description clamped to two lines with a tap to expand.
   - Vibe tags as read-only `StatusPill`s.
   - Estimated cost in `meta`, tabular.
   - **Group score** — a single prominent signed number with a `tone` derived from sign, paired with a "+N group score" label so colour is not the only signal.
   - `VoteBar` + `VoteControl scale={PREFERENCE_SCALE} layout="labeled"`.
   - `AvatarStack` of voters; overflow menu; `ProposalComments` footer.
4. **Add / Edit sheet** — `BottomSheet` with name, description, image URL, estimated cost, and a `ChipPicker multiple` for vibe tags (replacing the clickable badges).

## Components

`ProposalCard`, `VoteControl`, `VoteBar`, `ChipPicker`, `StatusPill`, `AvatarStack`, `BottomSheet`, `EmptyState`, `ProposalComments`, `PageGrid`.
Scoring comes from `tally()` in `lib/voting.ts` — the local `reduce` is deleted.

## States

- **Loading** — three media-card skeletons *including* the image block, so the reserved aspect ratio is visible before load.
- **Empty** — `EmptyState` with a MapPin icon: "No destinations suggested yet".
- **Broken image** — the tinted fallback tile described above.

## Motion

- Cards stagger 40 ms; the image cross-fades in on decode.
- Score changes tick with a brief scale pulse.

## Responsive

- **≥768** — 2-up grid; media stays 16:9.
- **≥1024** — `PageGrid` 2-column, list left, leaderboard rail right.

## Deviations from MASTER

- The most media-forward screen; media is the card's leading element rather than an optional slot.
