# App Shell & Navigation

**Sources:** `client/src/components/AppShell.tsx` (45 lines), `client/src/components/MobileNav.tsx` (47 lines)
**Applies to:** every routed screen except `not-found` and `magic-link-verify`.

Not a screen, but the chrome every screen inherits. Read this before any page spec.

## Current problems

- **`safe-area-bottom` at `MobileNav.tsx:24` is defined nowhere.** It is a silent no-op, and `client/index.html` has no `viewport-fit=cover`, so `env(safe-area-inset-*)` resolves to `0px` regardless. The tab bar sits under the iPhone home indicator.
- `maximum-scale=1` in the viewport meta **blocks pinch-zoom** — a WCAG 1.4.4 failure.
- `min-h-screen` (100vh) causes the mobile browser-chrome jump.
- The header renders **only when `title` is set**, so screens without a title have no chrome at all.
- `<main>` hardcodes `pb-24` (96 px) against a `h-16` (64 px) nav — a magic number that is simultaneously wrong for safe-area devices and for `TripPreferences`, which independently guesses `bottom-14`.
- Tab items are bare `<div>`s inside `<Link>` — no `<button>`, no `aria-current`, no `role`. The actual hit area is ~40 px, under the minimum.
- Active state is carried by colour alone.
- **"New Trip" is a tab.** It is an action, not a destination — it breaks the back stack and leaves nothing highlighted.
- Tab matching uses `location.startsWith(item.href)`, so `/trips/123` matches `/trips/new` and deep trip routes highlight nothing.
- `MobileNav` returns `null` when logged out, but `<main>`'s `pb-24` remains.
- Toasts default to `bottom-right`, landing on top of the tab bar.

## Shell structure

```
<div class="min-h-dvh flex flex-col bg-background">
  <header>        sticky, safe-area-inset-top, elevation on scroll
  <main>          max-w-2xl, PageGrid slot, bottom inset reserved
  <MobileNav>     floating, safe-area-inset-bottom
  <FAB>           optional, above the nav
```

### Header

- Two variants: **large title** (`title-lg`, part of the scroll content) collapsing into a **compact bar** (`title`, sticky, blurred, `--elevation-3`) once scrolled past the large title.
- Always available, independent of whether `title` is passed.
- Padded with `env(safe-area-inset-top)`.
- Back button ≥44 px, `aria-label="Back"`, honouring `backHref` and falling back to history.
- The right slot holds at most one primary affordance plus one overflow menu. Destructive items live in the overflow, below a divider.

### Main

- `PageGrid` is the direct child. One column below `lg`, two above.
- Bottom padding is `calc(var(--nav-height) + env(safe-area-inset-bottom) + 16px)` — **never a hardcoded `pb-24`**, and never re-guessed per screen.
- `--nav-height` is defined once, in `index.css`, and is what `StickyActionBar` also reads. This is what fixes `TripPreferences`' 8 px overlap for good.

### MobileNav

- A **floating pill bar**: inset from the screen edges, fully rounded, `--elevation-3`, `backdrop-blur`, sitting on a translucent `--card`.
- Padded with `env(safe-area-inset-bottom)` via a **real** utility defined in `index.css`.
- Three destinations, all genuine top-level places:

  | Tab | Route | Icon |
  |---|---|---|
  | Trips | `/` | Home |
  | DNA | `/quiz` | Compass |
  | Alerts | `/notifications` | Bell + badge |

  **"New Trip" is removed** and becomes a FAB on Home. It is an action, not a
  destination: as a tab it broke the back stack and left nothing highlighted.

  The earlier draft of this spec called for a separate `/trips` destination.
  That was dropped: the Home screen *is* the trips list, so a second tab would
  have duplicated it and required a route that does not exist. The Home tab is
  labelled "Trips" instead, and its match includes `/trips/*` so deep trip
  routes highlight it correctly. Three tabs is within the ≤5 limit.
- Each item is a `<button>` (or `<Link>` rendering one) at ≥44×44 px with ≥8 px spacing, carrying `aria-current="page"` when active.
- Active state uses **three** signals: `--primary` colour, weight 600 label, and a filled indicator pill behind the icon. Never colour alone.
- The Trips tab matches `/` exactly plus any `/trips/*` route, so deep trip screens keep it highlighted. Other tabs match by prefix.
- The badge clears when the destination is visited.
- Hidden entirely when logged out **and** the bottom inset drops to zero with it.

### FAB

- Pill, `--primary`, ≥56 px, positioned above the nav plus safe area.
- Present on Home and Trips ("New trip") and on the list screens ("Add"). One per screen, never two.
- Scales to 0.97 on press.

## Global mobile correctness

These land together, in one commit, because they are coupled:

1. `client/index.html` viewport → `width=device-width, initial-scale=1, viewport-fit=cover`. **`maximum-scale=1` is removed.**
2. **In the same commit**, `ui/input.tsx` and `ui/textarea.tsx` go to ≥16 px text on mobile — otherwise removing `maximum-scale` re-introduces iOS focus-zoom and trades one bug for another.
3. `index.css` gains real safe-area utilities and `--nav-height`.
4. All 9 `min-h-screen` become `min-h-dvh`.
5. `ui/sonner.tsx` drops `next-themes` for the app's own `useTheme`, and sets `position="top-center"`.
6. `ui/button.tsx` sizes meet 44 px, and the `hover:text-accent-foreground` dropped from `outline` and `ghost` is restored.

## Theme toggle

Lives in the Home header's avatar menu, offering Light / Dark / System, persisted
to `localStorage`. `ThemeContext` must have `switchable` passed at `App.tsx:50`
— today it defaults to `false`, so the toggle never worked.

**Do not surface the toggle until the colour migration is complete.** Enabling
dark while raw palette classes remain produces a half-dark UI.

## Motion

- Header collapse cross-fades the two title treatments; no layout jump.
- The active tab indicator slides between items with a spring.
- Route transitions: forward slides in from the right, back from the left, matching navigation direction. Reduced motion falls back to a cross-fade.

## Responsive

- **< 1024** — floating tab bar as described.
- **≥ 1024** — the tab bar is replaced by a persistent left sidebar with the same four destinations plus the FAB action promoted to a button. `PageGrid` goes two-column. Core navigation must remain reachable from every depth.
