# Trip Harmony Design System

Two-tier spec: a global **Master** plus optional **per-page overrides**.

```
design-system/
├── README.md          ← you are here
├── MASTER.md          ← global source of truth
├── tokens.py          ← the OKLCH token definitions (light + dark ramps)
├── verify_tokens.py   ← contrast-checks every pair; exit 1 on failure
├── generate_css.py    ← writes client/src/index.css from tokens.py
├── migrate_colors.py  ← one-shot raw-palette -> token migration (done)
├── color.py           ← sRGB ⇄ OKLCH + WCAG contrast helpers
└── pages/*.md         ← one spec per screen; overrides MASTER where they disagree
```

## How to use it

Before building or changing a screen:

1. Read `MASTER.md`.
2. Check whether `pages/<screen>.md` exists.
3. **If the page file exists, its rules take precedence** over Master for that screen.
4. If it does not exist, Master governs exclusively.

## Regenerating the tokens

Every colour value in `MASTER.md` is generated, not hand-picked, and every
foreground/background pair is contrast-checked. To re-verify after a change:

```bash
cd design-system && python verify_tokens.py
```

`tokens.py` holds the OKLCH definitions and the light/dark ramps; `color.py`
holds the colour-space and WCAG maths. 96 pairs are checked; the target is
zero failures.

## Provenance

The palette hues come from the `ui-ux-pro-max` skill's `colors.csv`
**"Road Trip Planner"** product entry (adventure orange + map teal on warm
paper). Lightness values were then solved so that every pair meets WCAG AA —
the skill's raw values assumed black-on-orange, which we did not want.
The type pairing (Plus Jakarta Sans) comes from the same skill's
`typography.csv`; the 4-level elevation scale from its `dimensional-layering`
style entry.
