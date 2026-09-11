# Redesign status

Last updated: 2026-09-11 · master at `11edb9f`

Read `MASTER.md` for the rules and `pages/*.md` for per-screen specs. This file
is only "where the work got to" — delete the sections as they are finished.

---

## How to see the screens

**There is no working database in this workspace.** `.env.local` holds an
unfilled `DATABASE_URL` template (literal `[password]`/`[host]`), there is no
local Postgres, and Docker Desktop starts but its engine never becomes
reachable. So `auth.demoSignIn` finds no persona and every auth-gated screen is
unreachable the normal way.

```bash
# Windows
npx tsx watch --env-file=.env.local server/_core/index.ts
```

Then open **`/preview/seed`**. It puts one trip's worth of data into the React
Query cache and the _real_ page components render it — no mock screens. Pick a
seat (admin / tripmate / watcher) before navigating; a watcher sees a
materially different app and role bugs are invisible from the admin view.

Everything in `client/src/preview/` is behind `import.meta.env.DEV`.

## The gate

```bash
pnpm check:ui
```

Runs types, build, tests, token contrast and design-system drift **unpiped**,
checking each exit status. Use it instead of ad-hoc shell pipelines —
`vite build | tail -3 && echo OK` reports the status of `tail`, which is how a
broken build once got committed.

---

## Not done

### Screens never reviewed

`Admin`, `JoinTrip`, `MagicLinkVerify`. Nothing is known to be wrong with them;
they simply were not opened. `JoinTrip` and `MagicLinkVerify` are signed-out
screens, so they need no fixtures.

### Server-side question, unresolved

As a **watcher**, the trip summary reads "Coming · 7 adults"; as an admin the
same trip reads "6 adults · 1 child · 1 pet". The watcher projection in
`server/routers/` appears to collapse the headcount. It may be deliberate — a
watcher is denied member details — but flattening children and pets into
"adults" states something untrue rather than withholding it. Decide which it
is, then either document it or fix it.

### Screen transitions — cut, with a reason

Direction-aware push/pop transitions were attempted three times and abandoned.
The failure: wouter flushes its location update in the same dispatch as the
`popstate` handler that would set the direction flag, so the flag is read
before it is written; the capture phase does not help, and a path-stack
approach worked twice before the effect stopped firing. What ships instead is
`screen-forward` on `AppShell`, `LegalPage` and `StatusScreen` — a single
entrance, **not** direction-aware, on components that remount per route.

Anyone picking this up should own the history stack rather than observing it.

### Density work left on the proposal screens

The four proposal screens (`TripDates`, `TripDestinations`,
`TripAccommodations`, `TripBudget`) are consistent now but still tall. The
remaining candidates, in order of payoff:

- `ProposalComments` is a full-width row under every card even when collapsed.
- `TripAccommodations` cards carry beds, baths, price, amenities, link, AI
  match and votes — the longest card in the app, and nothing is folded.
- The `ScreenHeader` subtitle plus the finalised line plus the action row is
  three stacked rows before the first proposal.

### Known cosmetic

`TripDashboard` has no active tab in `MobileNav` (a trip route matches no
top-level destination). Arguably correct, but it reads as "nothing selected".

---

## Done, and where the rules live

Load-bearing decisions, so they are not re-litigated:

| Decision                                | Where it lives                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour is generated, never hand-written | `tokens.py` → `generate_css.py` → `index.css`. Never edit the token blocks in `index.css`.                                                                                                                    |
| `-soft` tints, `-pick` selections       | `-pick` is the "you chose this" fill: light, saturated, dark text. Neither the base (solved against white, so dark in light mode) nor `-soft` (nearly the page colour) works in both themes.                  |
| A spine means status                    | Success = settled, warning = waiting, primary = unread. Never decorative — a gradient spine on every card spends the vocabulary.                                                                              |
| One vote control, one tally             | `VoteSegments` and `VoteTally` in `components/trip/ProposalRow.tsx`, both driven by `DATE_OPTIONS` / `CHOICE_OPTIONS`, which carry `icon`, `label`, `tone` and `active` together.                             |
| Modals are sheets on phones             | `sheet-surface` inside `ui/dialog.tsx`, plus `useSheetDrag`. One presentation for all ~26 dialogs; `BottomSheet` delegates to `Dialog`.                                                                       |
| Entrances are transform-only            | A keyframe starting at `opacity: 0` leaves content invisible if the animation never runs — throttled tabs, low-power mode, some WebViews. The sheet entrance also runs with no fill mode for the same reason. |
| Role rules are asked, never re-derived  | `canContribute` in `shared/roles.ts`; `pendingVoteCount` in `shared/votes.ts` takes the role so a count cannot be derived without it.                                                                         |
| Sentence case everywhere                | "Trip settings", "New trip", "My trip preferences".                                                                                                                                                           |
