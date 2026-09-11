# Create Trip

**Route:** `/trips/new`
**Source:** `client/src/pages/CreateTrip.tsx` (98 lines)
**Tier:** 4 — the funnel screen. Currently the cleanest form in the app; needs polish, not surgery.

## Current problems

- No validation infrastructure at all — `ui/form` and react-hook-form are unused, so a blank name submits and fails server-side.
- Inputs are `h-9` (36 px), under the touch minimum, and 14 px text on mobile, which will trigger iOS zoom once `maximum-scale=1` is removed.
- A single flat card with no sense of what happens next.
- Reached from the bottom nav, which is wrong: creating a trip is an action, not a destination (see `app-shell.md`).

## Layout (mobile, top → bottom)

1. **Header** — back + "New trip".
2. **Intro** — a plane icon tile and one line: "Name it, invite your group, and start voting." Sets expectation that this is step 1 of a short flow.
3. **Form** — a single `SectionCard`:
   - **Trip name** — required, autofocused, `subtitle`-sized input, ≥48 px tall, ≥16 px text. Helper text: "You can change this later."
   - **Description** — optional `Textarea`, 3 rows, auto-growing.
   - **Currency** — `Select`, defaulting to the user's locale currency rather than a fixed first option.
   - **Destination** _(optional)_ — free text; feeds the destinations screen as a starting suggestion.
     Every field has a visible label above it. Required fields are marked with an asterisk plus a legend.
4. **`StickyActionBar`** — "Create trip", full-width, ≥52 px. Disabled until the name is non-empty.
5. **After creation** — route straight to the new trip's dashboard with the invite sheet already open. The first thing a user needs after creating a trip is to invite people; making them find it is the main funnel leak.

## Components

`SectionCard`, `Input`, `Textarea`, `Select`, `Label`, `StickyActionBar`, `Button`, `PageGrid`.
Currency formatting via `lib/format.ts`.

## States

- **Validation** — on blur, not on keystroke. The error sits below the field with an icon and states the fix ("Give your trip a name so your group recognises it").
- **Submitting** — the action disables and shows a spinner; fields go read-only, not disabled.
- **Failure** — an inline error above the action bar plus a toast; the form keeps every value.
- **Focus management** — a failed submit moves focus to the first invalid field.

## Motion

- The card fades + rises on mount.
- The action bar slides up once the form becomes valid.
- No motion on the fields themselves.

## Responsive

- **≥768** — card centres at `max-w-lg`; the action bar becomes inline.
- **≥1024** — unchanged; this screen does not need a second column.

## Deviations from MASTER

- The first screen to adopt `ui/form` + react-hook-form + zod. Its resolver pattern becomes the template for `JoinTrip` and the sheet forms, so get it right here.
