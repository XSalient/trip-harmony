# Trip Budget

**Route:** `/trips/:id/budget`
**Source:** `client/src/pages/TripBudget.tsx` (273 lines)
**Tier:** 3 — the cleanest existing screen; mostly needs tokens, a chart, and sheets.

## Current problems

- `categoryIcons` / `categoryColors` maps at `:30-34` hardcode `bg-blue-100 text-blue-700` etc.
- Two gradient stat cards are bespoke markup.
- A `PieChart` icon is used decoratively at `:172` while `ui/chart` and recharts sit unused — the screen shows a category breakdown as bare progress bars when it could show an actual chart.
- Expense rows have no swipe or clear delete affordance.

## Layout (mobile, top → bottom)

1. **Header** — back + "Budget". Right: a settings action opening the per-person limit sheet.
2. **Summary** — two `StatCard`s side by side, tabular numerals throughout:
   - **Total spend** — large figure, currency-formatted via `lib/format.ts`.
   - **Per person** — the derived figure, with the limit as `hint` ("of £600").
     When over the limit the per-person card takes `tone="danger"` **and** gains an AlertTriangle icon plus the words "over budget" — never colour alone.
3. **Budget health** — a single horizontal meter: spent vs limit, with a marker at 100%. Segment colours come from `--success` / `--warning` / `--danger`, each labelled.
4. **By category** — a `SectionCard` holding a **recharts donut** (`ui/chart`), each arc a `--cat-*` hue, with a legend that doubles as the list: icon tile, category name, amount, share. Legend entries toggle their arc.
   Below 5 categories a donut is fine; the guard against overuse is that we never exceed the 6-hue ramp.
5. **Expenses** — a grouped list, newest first, with date subheads:
   - Category icon tile in the matching `--cat-*` soft surface.
   - Title plus payer as `body` / `body-sm`.
   - Amount right-aligned, tabular.
   - Overflow menu for Edit / Delete; Delete confirms and offers Undo via toast.
6. **Add expense** — FAB opening a `BottomSheet`: amount (numeric keyboard), title, category `Select`, payer, date.

## Components

`StatCard`, `SectionCard`, `EmptyState`, `BottomSheet`, `StatusPill`, `Select`, `Progress`, `ui/chart` + recharts, `PageGrid`.
Category icons and hues come from `lib/taxonomy.ts`; all money through `lib/format.ts`.

## States

- **Loading** — summary skeletons plus a donut placeholder (a grey ring, not an empty axis frame).
- **Empty** — `EmptyState` with a Wallet icon: "No expenses logged yet".
- **No limit set** — the per-person card shows "Set a limit" as its action instead of a ratio.
- **Chart with no data** — "Nothing to break down yet", never a blank chart.

## Motion

- Donut arcs sweep in over `--motion-slow` on first render; static under reduced motion.
- The budget meter animates width, not layout.
- Expense rows stagger 30 ms.

## Responsive

- **≥768** — summary cards stay 2-up; donut and legend go side by side.
- **≥1024** — `PageGrid` 2-column: chart plus summary left, expense list right.

## Deviations from MASTER

- The only screen using recharts. Chart rules from the skill apply: legend always visible, tooltips on tap, a text summary for screen readers, values labelled directly where space allows, and the donut never carries more than 6 categories.
