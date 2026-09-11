# Trip Preferences

**Route:** `/trips/:id/preferences`
**Source:** `client/src/pages/TripPreferences.tsx` (199 lines)
**Tier:** 3 — per-trip free-text preferences feeding the AI matcher.

## Current problems

- **The sticky save bar is mis-offset:** `:180-181` uses `fixed bottom-14` with a comment claiming the nav is `h-14` (56 px), but `MobileNav` is `h-16` (64 px). The bar overlaps the nav by 8 px on every render.
- 14 raw palette classes against only 9 semantic ones — the worst ratio in the app.
- An amber "Tip" callout at `:149-154` is bespoke markup.
- Duplicate `mx-auto max-w-2xl` at `:117` that `AppShell`'s `<main>` already applies.
- Four large borderless textareas in a row with no sense of progress or completion.

## Layout (mobile, top → bottom)

1. **Header** — back + "Your preferences".
2. **Context card** — trip name, "N of M members submitted" as a `StatusPill`, and a saved-state indicator. An `AvatarStack` shows _who_ has submitted, which is the social pressure that actually gets these filled in.
3. **Tip callout** — a `SectionCard tone="info"` with a Lightbulb icon, replacing the bespoke amber div: one line on why this helps the AI.
4. **Four preference sections** — one `SectionCard` each, from the existing `SECTIONS` config:
   - _Must-haves_ — `--success` tone
   - _Strong preferences_ — `--info` tone
   - _Avoids_ — `--danger` tone
   - _Anything else_ — neutral
     Each carries an icon, a one-line prompt, a `Textarea` (≥16 px text, auto-growing, min 3 rows), and a soft character counter that only appears past 80% of the limit.
     Above the textarea sits a `ChipPicker multiple` of common suggestions (quiet area, near transit, step-free access, pet friendly…) that append to the text — this makes the screen usable in fifteen seconds instead of five minutes, which is the real conversion problem.
5. **`StickyActionBar`** — Save, full-width, correctly offset by `--nav-height` + `env(safe-area-inset-bottom)`. Shows "Saved" with a check for 2 s after success.

## Components

`SectionCard`, `ChipPicker`, `StatusPill`, `AvatarStack`, `StickyActionBar`, `Textarea`, `Skeleton`, `PageGrid`.

## States

- **Loading** — context card plus four section skeletons.
- **Unsaved changes** — the save bar becomes active; navigating away confirms first.
- **Saving** — the button disables and shows a spinner.
- **Saved** — a brief inline confirmation, not a toast, because the user is looking at the button.
- **Draft** — long-form input auto-saves to local draft state so an accidental dismissal loses nothing.

## Motion

- Sections stagger 40 ms.
- Chips scale 0.97 on press; the appended text highlights briefly.
- The save bar slides up when changes become pending.

## Responsive

- **≥768** — sections 2-up.
- **≥1024** — `PageGrid` 2-column: sections left, context and member progress right. The save bar becomes inline rather than fixed.

## Deviations from MASTER

- Uses status tones (`--success` / `--info` / `--danger`) **as section identity** rather than as state. This is the one sanctioned exception, because the sections genuinely mean want / prefer / avoid. It is applied through `SectionCard`'s `tone` prop, never as raw classes.
