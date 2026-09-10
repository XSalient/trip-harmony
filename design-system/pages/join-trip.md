# Join Trip

**Route:** `/join/:code` — **public**
**Source:** `client/src/pages/JoinTrip.tsx` (106 lines)
**Tier:** 4 — the invite entry point, and the only screen an unauthenticated stranger sees besides the landing page. Its conversion rate is the app's growth rate.

## Current problems

- Uses `AppShell`, but `MobileNav` returns `null` when logged out while `<main>` still carries `pb-24` — a dead 96 px gap under the card.
- The invite card is generic: an icon tile, a trip name, a description. It gives an invitee no reason to accept.
- No sense of who invited them or who is already in.
- "Trip not found" is a bare message with no route forward.

## Layout (mobile, top → bottom)

1. **Minimal header** — wordmark only, centred. No back button; there is nowhere to go back to.
2. **Invite card** — the whole screen is this one card, vertically centred, `--elevation-3`:
   - **Inviter line** — avatar plus "Priya invited you to". This is the trust signal that makes the difference; surface it above the trip name.
   - **Trip name** as `title-lg`.
   - Destination and date range as `body-sm`, tabular, when known.
   - Description clamped to three lines.
   - **`AvatarStack` of current members** plus "and N others" — social proof that the trip is real.
   - A short "What you'll do here" list: three rows with icons — vote on dates, pick a place to stay, split the budget. An invitee needs to know what they are joining.
3. **Action**
   - Signed in → "Join this trip", full-width primary, ≥52 px.
   - Signed out → "Sign in and join", opening `AuthDialog`; after auth the existing `autoJoinPending` flow completes the join without a second tap.
4. **Reassurance line** — `caption`: "You can leave at any time."

## Components

`AvatarStack`, `StatusPill`, `Button`, `AuthDialog`, `EmptyState`, `Skeleton`.
No `PageGrid` — this screen is deliberately a single centred column at every width.

## States

- **Loading** — a skeleton shaped like the invite card, so the layout does not jump.
- **Invalid / expired code** — `EmptyState` with a Compass icon: "This invite link isn't valid" plus a possible reason (expired, or revoked) and a "Go to Harmony" action. Never a dead end.
- **Already a member** — the action becomes "Open trip" rather than "Join".
- **Joining** — the button disables and shows a spinner.
- **Join failed** — inline error with a retry; the invite context stays on screen.

## Motion

- The card scales in from 0.96 with a spring on mount — a small moment of arrival.
- The "what you'll do" rows stagger 40 ms.
- The member stack fades in last.

## Responsive

- **≥768** — the card caps at `max-w-md` and stays centred.
- **≥1024** — unchanged.

## Deviations from MASTER

- **No bottom nav and no `pb-24`** — remove the inherited padding.
- The only screen that centres its content vertically at every breakpoint.
- Marketing-adjacent copy is allowed here; everywhere else stays functional.
