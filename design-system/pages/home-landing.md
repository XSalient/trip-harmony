# Home — Landing (logged out)

**Route:** `/` when `isAuthenticated === false`
**Source:** `client/src/pages/Home.tsx` → `LandingPage` (to be split into `pages/Landing.tsx`)
**Tier:** 1 — the only marketing surface; every unauthenticated session starts here.

## Current problems

- Bypasses `AppShell` but `<main>` still carries `pb-24`, leaving dead space with no bottom nav.
- Hero is raw divs with a `from-primary/10 via-accent/10 to-secondary/10` gradient — three tokens blended into mud.
- Feature grid is built from a literal array carrying inline colour strings.
- Single CTA, no social proof, no explanation of the group-planning premise beyond one line.
- Shares a file with the authenticated dashboard, making any diff unreadable.

## Layout (mobile, top → bottom)

1. **Header** — wordmark left, "Sign in" ghost button right. Transparent over the hero, gaining `--elevation-3` + backdrop blur once scrolled past 24 px.
2. **Hero** — full-bleed, `min-h-[78dvh]`, safe-area padded.
   - Eyebrow `StatusPill tone="info"` with a Sparkles icon: "AI-powered group travel".
   - `display` headline, two lines, second line in `--primary`.
   - `body` sub-line, max 60 characters per line.
   - Primary CTA full-width (≥52 px tall), secondary text link "See how it works" scrolling to §3.
   - Background: one soft radial wash in `--primary` at ~8% over `--background` — a *single* gradient, not three overlaid.
3. **Social proof strip** — `AvatarStack` of sample members plus "Planning trips for groups of 2–12". Low contrast, `body-sm`.
4. **How it works** — three numbered steps in a vertical timeline: *Everyone votes → Harmony finds the overlap → You book it.* Each step is an icon tile in a `--cat-*` soft surface plus title plus one line.
5. **Feature grid** — 2 columns, four `SectionCard`s in compact form (Travel DNA, Smart Voting, AI Referee, Budget Guard). Icon tile uses `--cat-1..4` soft surfaces; no inline colour strings.
6. **Closing CTA** — repeat of the primary action on a `--secondary` band.
7. **Footer** — minimal: wordmark, copyright.

## Components

`StatusPill`, `SectionCard`, `AvatarStack`, `Button`, `AuthDialog`, `PageGrid`.

## States

- No loading state — this is static.
- The CTA opens `AuthDialog`; while auth is in flight the button disables and shows a spinner.

## Motion

- Hero content: fade + 12 px rise, staggered 40 ms across eyebrow → headline → sub → CTA.
- Sections below the fold: fade + 16 px rise on first entry into view, once only.
- Under `prefers-reduced-motion`: everything renders in place, opacity only.

## Responsive

- **≥768** — hero headline steps to 40 px; feature grid stays 2-up.
- **≥1024** — hero becomes 2-column (copy left, illustrative card stack right); feature grid 4-up. Content capped at `max-w-6xl`, which is the one place a screen exceeds `max-w-2xl`.

## Deviations from MASTER

- The only screen permitted a `display`-step headline.
- The only screen allowed to exceed `max-w-2xl` (see above).
- No bottom nav, so no `--nav-height` reservation — remove the inherited `pb-24`.
