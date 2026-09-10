# Full-screen status screens — Not Found & Magic Link Verify

**Routes:** `/404` and the catch-all; `/auth/magic/:token`
**Sources:** `client/src/pages/NotFound.tsx` (52 lines), `client/src/pages/MagicLinkVerify.tsx` (59 lines)
**Tier:** 5 — utility. Grouped because they are the same pattern in three states.

These are the **only two screens that bypass `AppShell`**, which makes them the
check that tokens, `dvh` and safe areas also reach the shell-less code path.

## Current problems

### NotFound
**Completely off the design system.** Zero semantic tokens in the entire file:
- `:14` `bg-gradient-to-br from-slate-50 to-slate-100` and `min-h-screen`
- `:15` `bg-white/80`
- `:24`, `:26`, `:30` `text-slate-900` / `text-slate-700` / `text-slate-600`
- `:42` `bg-blue-600 hover:bg-blue-700 text-white` — **ignores `--primary` entirely**

It would be unreadable the moment dark mode is switched on. It needs a straight
rewrite, not a migration.

### MagicLinkVerify
- Three ad-hoc states (spinner / green check / red X) with no shared shape.
- The success state does not say what happens next or auto-continue.
- `min-h-screen`.

## Shared pattern — `StatusScreen`

Both screens render one component, centred in a `min-h-dvh` column with safe-area
padding on both ends:

1. **Icon medallion** — 72 px circle in the tone's `-soft` surface, icon in the tone's base colour.
2. **Title** — `title-lg`.
3. **Body** — one or two lines, `body`, measure capped at ~45 characters.
4. **Actions** — primary full-width; an optional secondary text link below.

`{ tone: "neutral" | "success" | "danger" | "info", icon, title, description, action, secondaryAction }`

## Screen states

| Screen | Tone | Icon | Title | Action |
|---|---|---|---|---|
| Not found | `neutral` | Compass | "We can't find that page" | "Go home" |
| Magic link — verifying | `info` | Spinner | "Signing you in…" | none |
| Magic link — success | `success` | CheckCircle | "You're signed in" | "Continue" *(auto-redirects after 1.5 s)* |
| Magic link — failed | `danger` | XCircle | "This link has expired" | "Send a new link" + "Back to home" |

Copy note: the 404 avoids blaming the user, and the expired-link state names the
cause and offers the fix, per the error-recovery rule.

## Components

`StatusScreen` (new, in `components/harmony/`), `Button`, `Spinner`.
No `AppShell`, no `MobileNav`, no `PageGrid`.

## Motion

- The medallion scales in from 0.9 with a spring.
- Title and body fade + rise, staggered 40 ms.
- The verifying spinner is the only continuous animation, and it stops the moment the state resolves.
- Under reduced motion everything renders in place.

## Responsive

- Content caps at `max-w-sm` and stays centred at every width.

## Deviations from MASTER

- No shell, no nav, no grid — deliberate. These screens must work when the rest of the app has failed, so they depend on nothing but tokens.
- The magic-link success state is the only place in the app that auto-navigates. It shows its destination first and the redirect is cancellable by tapping "Continue" early.
