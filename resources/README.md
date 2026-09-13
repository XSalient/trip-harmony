# Native app icons — source images

The three files here are the **input** to the iOS and Android icon sets. They
are not shipped to the web (the web's icons live in `client/public/icons/`) and
nothing in the build reads them. They exist because `ios/` and `android/` are
not in this repository — they are generated on a developer's machine
(`docs/runbooks/launch.md`, step 5) — and the icons have to come from somewhere
when they are.

| File                  | What it is                          | Used for                                           |
| --------------------- | ----------------------------------- | -------------------------------------------------- |
| `icon.png`            | 1024×1024, the logo, corners clear  | Every iOS icon, and Android's legacy (pre-26) icon |
| `icon-foreground.png` | 1024×1024, the logo inset to 72/108 | Android adaptive icon, foreground layer            |
| `icon-background.png` | 1024×1024, solid `#a855f7`          | Android adaptive icon, background layer            |

The foreground is inset deliberately. Android crops an adaptive icon's layers
to whatever shape the launcher prefers — circle, squircle, teardrop — and only
the middle 72dp of the 108dp layer is guaranteed to survive. Art drawn to the
edge loses its corners. The background is the logo's own purple, so the inset
logo's rounded-square edge disappears into it and what the launcher masks is a
plain purple field with the mark centred on it.

## Generating the native icons

After `npx cap add ios` / `npx cap add android` have created the native
projects:

```bash
npx @capacitor/assets generate --assetPath resources
```

It writes into `ios/` and `android/`, which are then committed. Re-run it only
when the art here changes — the generated files are part of the native
projects, not a build output.

**There is no splash-screen source here.** `@capacitor/assets` will say so and
carry on with the icons. The splash is `@capacitor/splash-screen` showing the
native launch screen, which is currently the flat `#ffffff` from
`capacitor.config.ts`; giving it real art means adding `splash.png` (2732×2732)
and `splash-dark.png` beside these files, and is a design decision nobody has
made yet.

## Where these came from

A favicon package supplied by design, 2026-09-13. `icon.png` is that package's
1024×1024 export unchanged. `icon-foreground.png` is the same export scaled to
683px on a transparent 1024px canvas; `icon-background.png` is a solid fill of
the logo's purple. The same package's web sizes — including the `dev-` and
`staging-` tints — are in `client/public/icons/`.
