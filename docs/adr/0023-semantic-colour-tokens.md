# 0023. Status colour is a token, not a Tailwind palette class

- Status: Accepted
- Date: 2026-08-28

## Context

Applying a new design — a violet primary and an amber accent, replacing the teal
one — meant finding every colour in the client. Roughly 180 of them were not in
`index.css` at all: they were hardcoded Tailwind palette classes written into
the screens, `bg-green-100`, `text-yellow-700`, `border-red-300`, spread across
21 files.

They were not decoration. Each carried a meaning — green for a decision the
group has settled, amber for something waiting on you, red for a veto or a
dealbreaker — but the meaning lived only in the reader's head, so the same
meaning was spelled differently in each place it appeared. "Finalised" was
`text-green-600` in five files and `text-green-700` in three. The love/fine/veto
tally was green/yellow/red on the dates and budget rows and pink/blue/red on the
choice rows: one scale, two palettes, and no way to tell from the code whether
that was intentional.

Every one of those classes also carried a `dark:` twin — `dark:bg-green-950/10`
— so the dark palette was stated a second time, in the screens, where nobody
comparing them could see both at once.

A palette that lives in 21 files cannot be changed; it can only be re-typed.

## Decision

**Colour with a meaning is a CSS variable in `client/src/index.css`, exposed to
Tailwind through `@theme inline`. Screens name the meaning, never the hue.**

Five status families, each with the same three parts:

| Family      | Means                                           |
| ----------- | ----------------------------------------------- |
| `success`   | settled — decided, finalised, saved, available  |
| `attention` | waiting on you — unvoted, over a cap, a "maybe" |
| `caution`   | something you said you would rather avoid       |
| `danger`    | a veto, a dealbreaker, a destructive action     |
| `info`      | a neutral note the reader did not ask for       |

`-soft` is a fill, `-strong` is text that sits on that fill, `-border` is its
edge, giving `bg-success-soft text-success-strong border-success-border`. The
brand gradient behind every header is `--brand-gradient-from/to`.

`--radius`, `--primary`, `--background` and the rest of the shadcn variables
were already here and stay here. The vendored primitives in
`client/src/components/ui/**` therefore pick the design up without being
touched, which is why they can stay unmodified.

Two consequences fell out of the migration and are part of the decision:

- **The love/fine/veto tally is one scale** — success, attention, danger —
  wherever it appears. The pink/blue variant is gone.
- **`dark:` variants on status colour are gone.** A `.dark` block redefines the
  same tokens, so a screen states the colour once and it is correct in both.
  This also made the dark palette real: it had never been defined, so every
  `dark:` class in the client had been dead code.

`--accent` stays a pale tint rather than the design's solid amber. It is
shadcn's hover and selected state — dropdown items, calendar days — so a solid
fill there gilds every hover in the app. Solid amber is `attention-soft`.

## Consequences

Changing what "settled" looks like is one line. Adding a screen means choosing a
meaning from the table above rather than inventing a hue, and reviewing one
means checking that choice rather than eyeballing whether this green matches the
last green.

The cost is a layer of naming between the screen and the colour: `bg-green-100`
says exactly what it renders and `bg-success-soft` does not, so somebody new has
to read `index.css` once. That is the trade — and it is only worth making while
the families stay few and stay about meaning. A `--color-brand-purple-2` would
be the same problem with more steps.

A grep for `-(green|amber|red|blue|…)-[0-9]` under `client/src` outside
`components/ui/**` should find nothing. If it finds something, that is a screen
that has started keeping its own palette again.
