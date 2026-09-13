# App icon art

`icon.png` — 1024×1024 — is the only icon anybody edits. Everything the iOS and
Android apps need is generated from it:

```bash
pnpm icons:native          # regenerate, and install into ios/ and android/ if they exist
pnpm icons:native --check  # fail if what is committed no longer matches icon.png
```

`generated/` is that output, committed. It mirrors the paths the files belong at
inside the native projects, so installing them is a copy and reviewing them does
not need Xcode:

| Generated                                | Goes to                  | What it is                                                        |
| ---------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `ios/…/AppIcon.appiconset/`              | the iOS asset catalogue  | One 1024px icon with **no alpha channel**, plus `Contents.json`   |
| `android/…/mipmap-*/ic_launcher.png`     | Android 7 and older      | The mark as drawn, 48–192px                                       |
| `android/…/mipmap-*/ic_launcher_round.*` | round launchers          | The mark on a circle of the field colour                          |
| `android/…/ic_launcher_foreground.png`   | Android 8+ adaptive icon | The mark inside the 72dp safe zone, 108–432px                     |
| `android/…/ic_launcher_background.png`   | Android 8+ adaptive icon | A flat field of the brand colour                                  |
| `android/…/mipmap-anydpi-v26/*.xml`      | Android 8+ adaptive icon | The two-layer declaration                                         |
| `capacitor-assets/`                      | `npx @capacitor/assets`  | The same layers in that tool's layout, if you would rather use it |

## Why it is generated here rather than by the usual tool

`npx @capacitor/assets generate` is the standard answer and it still works —
that is what `capacitor-assets/` is for. It needs `sharp`, a native binary
fetched at the moment it runs, so it can only run on the machine doing the
release. On a project with one person on it that puts the only check of the
icons at the single most expensive moment to find a mistake.

`scripts/lib/png.mjs` is a small dependency-free PNG reader and writer, so the
icons are produced from a clean clone with nothing installed and nothing
fetched — and `pnpm test` checks the committed output still matches the art
(`scripts/lib/nativeIcons.test.mjs`), the same way a migration has to match the
schema.

## The two shape rules the generator exists to respect

- **Android crops adaptive icons and the app does not choose the shape** —
  circle, squircle, teardrop, whatever the launcher prefers. Each layer is
  108dp and only the middle 72dp always survives, so the foreground is the mark
  scaled into that square over a separate flat background.
- **iOS masks the icon itself and rejects an alpha channel.** The art's rounded
  corners are filled with its own field colour, so iOS rounds a complete square
  once instead of rounding an already-rounded mark. A transparent corner ships
  as black.

## Not here: the splash screen

`@capacitor/splash-screen` shows the native launch screen, currently the flat
`#ffffff` set in `capacitor.config.ts`. Giving it real art means a
`splash.png` (2732×2732) and a dark variant, and a decision about what it
should show — which nobody has made. The icons do not depend on it.

## Provenance

A favicon package supplied by design, 2026-09-13. `icon.png` is that package's
1024×1024 export, unchanged. The same package's web sizes — including the
`dev-` and `staging-` tints — are in `client/public/icons/`.
