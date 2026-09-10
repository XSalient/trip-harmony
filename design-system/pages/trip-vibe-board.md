# Trip Vibe Board

**Route:** `/trips/:id/vibe`
**Source:** `client/src/pages/TripVibeBoard.tsx` (229 lines)
**Tier:** 3 — the smallest voting screen; adds image media to `ProposalCard` cheaply.

## Current problems

- **Despite the name it is a single-column list, not a board.** This is the single biggest miss on the screen.
- Tag chips are raw `<button>`s at `:131-133`.
- Delete is a bare `<button>` at `:176`.
- Raw `<img>` with the `onError` hack.

## Layout (mobile, top → bottom)

1. **Header** — back + "Vibe Board", overflow menu.
2. **Filter row** — a horizontally scrolling `ChipPicker` of tags, plus "All". Scrolls in its own container.
3. **The board** — a genuine **2-column masonry grid** on mobile, which is what makes this screen feel different from the other three voting screens:
   - Variable-height cards driven by the image's natural aspect ratio, with the ratio reserved before load.
   - A card is image-first: media, then title, then a one-line description.
   - `AvatarStack` of voters, small.
   - Signed score badge on the media, top-right, over a legibility scrim.
   - `VoteControl scale={PREFERENCE_SCALE} layout="icon" size="sm"` pinned to the card foot — icon layout because the cards are narrow, with `aria-label`s carrying the full word.
   - Link-out chip when the item has a URL.
   - Long-press or overflow for Delete.
4. **Add** — FAB opening a `BottomSheet`: title, description, link, image, and a `ChipPicker multiple` for tags.

## Components

`ProposalCard` (a `masonry` presentation of the same component), `VoteControl`, `ChipPicker`, `AvatarStack`, `StatusPill`, `BottomSheet`, `EmptyState`, `PageGrid`.

## States

- **Loading** — six masonry skeletons of varied heights, so the layout reads as a board immediately.
- **Empty** — `EmptyState` with an Image icon: "Nothing on the board yet" / "Drop in links, photos and ideas."
- **Text-only item** (no image) — renders as a quote-style card on a `--secondary` surface rather than an empty media box.
- **Broken image** — tinted fallback, keeping the reserved height.

## Motion

- Cards fade + rise on entry, staggered 30 ms, capped at 8.
- A cast vote bumps the score badge with a spring.
- Under reduced motion the masonry renders statically with no stagger.

## Responsive

- **≥768** — 3 columns.
- **≥1024** — 4 columns inside `PageGrid` with `span="full"`.

## Deviations from MASTER

- **The only masonry layout in the app**, and the only screen using `VoteControl layout="icon"` at `size="sm"` as its primary vote affordance. Both are deliberate: the board's value is visual density.
- Card titles may use `body-sm` rather than `subtitle` given the narrow column.
