# AI Referee

**Route:** `/trips/:id/referee`
**Source:** `client/src/pages/TripReferee.tsx` (130 lines)
**Tier:** 3 — the app's personality surface, and currently the least expressive.

## Current problems

- A gradient intro card with a large bot tile, then one button, then a flat feed — visually inert for what is meant to be the product's signature feature.
- `typeIcons` / `typeColors` are hardcoded maps.
- Markdown renders through `Streamdown` in a `prose prose-sm` wrapper, but no typography plugin is configured in `index.css`, so `prose` is doing very little.
- No streaming affordance: analysis either is or is not there.

## Layout (mobile, top → bottom)

1. **Header** — back + "AI Referee".
2. **Referee card** — the one place `--brand-teal` leads. A compact card: bot mark, one line explaining what the referee does, and the state of the last analysis ("Last run 2 days ago" or "Never run"). The primary action lives here, full-width, ≥52 px: "Get referee analysis".
3. **Message feed** — newest first, each message a card:
   - A type tile (conflict / suggestion / nudge / consensus) in the matching `--cat-*` soft surface, with a `StatusPill` naming the type — icon *and* word.
   - Relative timestamp as `caption`.
   - Body rendered as markdown with a real typographic scale: headings map to `subtitle`, lists get proper indents and markers, `strong` picks up weight 600. Configure `@tailwindcss/typography` (already a devDependency) against the tokens rather than leaving `prose` unstyled.
   - Long messages clamp at ~12 lines with a "Read more" expander.
4. **Feedback** — each message carries a quiet "Helpful / Not helpful" pair. This is the cheapest way to make the surface feel alive and gives a signal worth having.

## Components

`SectionCard`, `StatusPill`, `EmptyState`, `Button`, `Skeleton`, `PageGrid`.
Message types resolve through `lib/taxonomy.ts`.

## States

- **Loading feed** — two message skeletons.
- **Empty** — `EmptyState` with a Scale icon: "The referee hasn't weighed in yet" / "Run an analysis once your group has voted." The CTA is the same primary action.
- **Analysis running** — the primary button disables and shows a spinner; a skeleton message card appears at the top of the feed immediately, so the wait has a visible destination. If the API streams, render tokens as they arrive.
- **Analysis failed** — an inline `tone="danger"` card stating what failed and offering Retry — never a silent no-op.

## Motion

- A new message enters with fade + 12 px rise.
- The running skeleton shimmers; static under reduced motion.
- No decorative animation on the bot mark.

## Responsive

- **≥768** — messages stay single-column; measure capped for readability.
- **≥1024** — `PageGrid` 2-column: referee card and controls left, feed right.

## Deviations from MASTER

- **The one screen where `--brand-teal` is the leading colour** rather than `--primary`, marking the referee as a distinct voice.
- The only screen rendering untrusted-length markdown, so it owns the `prose` configuration.
