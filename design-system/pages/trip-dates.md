# Trip Dates

**Route:** `/trips/:id/dates`
**Source:** `client/src/pages/TripDates.tsx` (433 lines)
**Tier:** 2 — **and the reference implementation for the whole system.**

## Why this screen goes first

It has one of everything — proposal list, votes, the only segmented vote bar,
comments, add/edit sheets, empty state — at a third of the dashboard's size.
Critically it uses the _odd_ vote scale (`available | maybe | unavailable`), so
building `VoteScale` against it proves the abstraction immediately rather than
discovering the mismatch four screens later.

## Current problems

- The vote-distribution bar at `:362-367` is three divs with inline `style={{width}}`; `ui/progress` is unused.
- Vote buttons carry hardcoded green/yellow/red active classes.
- A commented-out comment-count chip is still sitting at `:325-329`.
- Add dialog is a centred modal on mobile where a sheet belongs.

## Layout (mobile, top → bottom)

1. **Header** — `AppShell` back + "Dates". Right: overflow menu (Unlock, when organiser).
2. **Context strip** — the locked range if settled (`StatusPill tone="success"` + range in tabular numerals), otherwise "N proposals · M of P voted".
3. **Proposal list** — `ProposalCard density="full"` per proposal:
   - Title (label) as `subtitle`; the range plus night count as `meta`, tabular.
   - `StatusPill tone="success"` "Locked" when chosen.
   - `VoteBar` — segmented Yes/Maybe/No proportions, each segment carrying its count as text so colour is not the only signal.
   - `VoteControl scale={AVAILABILITY_SCALE} layout="labeled"` — three ≥44 px pills.
   - `AvatarStack` of voters, grouped by stance.
   - Overflow menu: Edit, Clone, Delete (destructive, separated).
   - Footer: `ProposalComments` with a count.
   - Organiser only: "Lock this date" as a full-width secondary action.
4. **Add** — a `BottomSheet` opened by a FAB. Keeps the existing two `Tabs`: _Manual_ (two date fields plus a label) and _Smart_ (natural-language parse). The tab list scrolls horizontally if it ever overflows.

## Components

`ProposalCard`, `VoteControl`, `VoteBar`, `AvatarStack`, `StatusPill`, `BottomSheet`, `EmptyState`, `Tabs`, `ProposalComments`, `PageGrid`.

## States

- **Loading** — three proposal-card skeletons.
- **Empty** — `EmptyState` with a Calendar icon: "No dates proposed yet" + "Propose dates" CTA.
- **Voting in flight** — optimistic; the control shows `pending` but stays interactive.
- **Error** — toast at `top-center`, optimistic state rolled back.

## Motion

- List staggers 40 ms.
- `VoteBar` segments animate width with `--motion-base`.
- The sheet springs from the bottom; the FAB scales to 0.97 on press.

## Responsive

- **≥768** — cards 2-up.
- **≥1024** — `PageGrid` 2-column: list left, a summary rail right (locked range, participation).

## Deviations from MASTER

- The only consumer of `AVAILABILITY_SCALE`.
- Comment threads render inline in the card footer rather than in a sheet, because the thread is short and context matters.
