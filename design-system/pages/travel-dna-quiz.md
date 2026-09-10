# Travel DNA Quiz

**Route:** `/quiz`
**Source:** `client/src/pages/TravelDnaQuiz.tsx` (268 lines)
**Tier:** 4 — onboarding, and a bottom-nav destination. First real impression of the product's personality.

## Current problems

- The step progress strip at `:211-218` is eight hand-built divs; `ui/progress` is unused.
- The per-trait result bars at `:178-183` use inline `style={{width}}` — again not `Progress`.
- A slider with a 5xl numeric readout gives a raw number with no meaning attached: "7" tells the user nothing.
- No way to go back and change an answer once past the review threshold, and no sense of how long the quiz is.

## Layout — question step (mobile, top → bottom)

1. **Header** — Close (X) left, "Question 3 of 8" centred as `label`, Skip right.
2. **Progress** — a single segmented `Progress` track, eight segments, completed ones filled `--primary`. Replaces the hand-built strip.
3. **Question card**
   - Large icon tile in a `--cat-*` soft surface, one hue per trait.
   - Question as `title-lg`.
   - One line of clarifying copy as `body-sm`.
4. **Answer**
   - `Slider`, full-width, ≥44 px thumb.
   - **A word, not a number.** The current value renders as its semantic label ("Comfort matters", "Happy roughing it") as `subtitle`, with the numeric value demoted to a small tabular figure. This is the key change: the quiz should read as a conversation.
   - Low/high anchor labels at either end, `label` step.
5. **`StickyActionBar`** — Back (ghost) and Next (primary). Next is the wider of the two. On the last question it reads "See my Travel DNA".

## Layout — review

1. **Result header** — a gradient card in `--primary` → `--accent`, holding a one-word DNA archetype derived from the trait mix plus a one-line description. This is the shareable moment; make it look like one.
2. **Trait list** — one row per trait: icon tile, name, a `Progress` bar with the value marked, and the semantic label. Tapping a row jumps back to that question.
3. **Actions** — "Retake" (ghost) and "Done" (primary).
4. **Group compatibility** — when the user is in trips, a compact card: "You're 78% aligned with the Lisbon group" linking through.

## Components

`Progress`, `Slider`, `StickyActionBar`, `SectionCard`, `StatusPill`, `Skeleton`, `PageGrid`.
Trait metadata (label, icon, hue, value words) lives in `lib/taxonomy.ts`.

## States

- **Loading** — a single question skeleton.
- **Mid-quiz resume** — answers persist locally, so returning re-enters at the first unanswered question.
- **Saving** — the final action disables and shows a spinner.
- **Already completed** — the route lands on review, not question 1.

## Motion

- Question transitions slide horizontally: forward enters from the right, back from the left, matching navigation direction.
- The progress segment fills as the step completes.
- Result bars fill left-to-right, staggered 40 ms, on first reveal.
- Under reduced motion, questions cross-fade with no translation.

## Responsive

- **≥768** — the question card centres at `max-w-lg`; the action bar becomes inline.
- **≥1024** — review goes 2-up: archetype card left, traits right.

## Deviations from MASTER

- **The only screen with horizontal step transitions**, and the only one hiding the bottom nav (`AppShell hideNav`) — a quiz is a focused flow and the tab bar competes with it. The header X is the escape route, satisfying the escape-route rule.
- The result header is the one sanctioned two-stop brand gradient in the app.
