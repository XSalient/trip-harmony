"""Generate client/src/index.css from the verified token definitions.

Run from the design-system/ directory:

    python generate_css.py

Writes ../client/src/index.css. Every colour value comes from tokens.py, which
contrast-checks all 96 foreground/background pairs across light and dark.
Never hand-edit the token blocks in index.css — edit tokens.py and re-run.
"""
import os

exec(open("tokens.py").read())


def theme_vars(D, status_fn, dark):
    """Emit the :root / .dark custom-property block for one theme."""
    out = []
    for k, v in D.items():
        out.append(f"  --{k}: {ok(*v)};")
    out.append("")
    for name, h in STATUS_H.items():
        s = status_fn(h, STATUS_C[name])
        for suf, v in s.items():
            out.append(f"  --{name}{suf}: {ok(*v)};")
    out.append("")
    for i in range(6):
        base, fg, soft, on_soft = cat(i, dark)
        out.append(f"  --cat-{i+1}: {ok(*base)};")
        out.append(f"  --cat-{i+1}-foreground: {ok(*fg)};")
        out.append(f"  --cat-{i+1}-soft: {ok(*soft)};")
        out.append(f"  --cat-{i+1}-on-soft: {ok(*on_soft)};")
    return "\n".join(out)


def glass_vars(key):
    """Glass + gradient custom properties for one theme."""
    g = GLASS[key]
    dark = key == "dark"
    L, C, H = g["tint"]
    out = [
        f'  --glass-bg: oklch({L:.3f} {C:.3f} {H:.1f} / {g["alpha"]});',
        f'  --glass-hairline: {g["hairline"]};',
        f'  --glass-blur: {g["blur"]};',
        f'  --scrim: oklch(0 0 0 / {0.62 if dark else 0.45});',
    ]
    for name, (a, b) in gradients(dark).items():
        out.append(f'  --grad-{name}: linear-gradient(135deg, {a} 0%, {b} 100%);')
    return "\n".join(out)


def theme_map():
    """Emit the @theme inline block mapping tokens onto Tailwind utilities."""
    out = []
    for k in LIGHT:
        out.append(f"  --color-{k}: var(--{k});")
    out.append("")
    for name in STATUS_H:
        for suf in ("", "-foreground", "-soft", "-on-soft", "-border"):
            out.append(f"  --color-{name}{suf}: var(--{name}{suf});")
    out.append("")
    for i in range(6):
        for suf in ("", "-foreground", "-soft", "-on-soft"):
            out.append(f"  --color-cat-{i+1}{suf}: var(--cat-{i+1}{suf});")
    return "\n".join(out)


CSS = f"""@import "tailwindcss";
@import "tw-animate-css";

/* ==========================================================================
   Trip Harmony design tokens

   GENERATED FILE — do not hand-edit the :root and .dark token blocks.
   Source of truth: design-system/tokens.py (96 WCAG contrast checks).
   Regenerate with:  cd design-system && python generate_css.py
   Spec:             design-system/MASTER.md
   ========================================================================== */

@custom-variant dark (&:is(.dark *));

@theme inline {{
  /* colour tokens -> Tailwind utilities */
{theme_map()}

  /* typography */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, sans-serif;

  /* radius scale (MASTER §4) */
  --radius-sm: calc(var(--radius) - 8px);
  --radius-md: calc(var(--radius) - 4px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 12px);

  /* elevation scale (MASTER §4) */
  --shadow-e1: var(--elevation-1);
  --shadow-e2: var(--elevation-2);
  --shadow-e3: var(--elevation-3);
  --shadow-e4: var(--elevation-4);

  /* motion (MASTER §7) */
  --ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-soft: cubic-bezier(0.7, 0, 0.84, 0);
}}

:root {{
  --radius: 1rem;

  /* chrome metrics — the single source for nav clearance.
     StickyActionBar and AppShell both read these; never hardcode pb-24. */
  --nav-height: 4rem;
  --header-height: 3.5rem;

  /* motion (MASTER §7) */
  --motion-fast: 150ms;
  --motion-base: 220ms;
  --motion-slow: 320ms;

  /* elevation — light */
  --elevation-1: 0 1px 3px rgb(0 0 0 / 0.08);
  --elevation-2: 0 4px 6px rgb(0 0 0 / 0.10);
  --elevation-3: 0 10px 20px rgb(0 0 0 / 0.10);
  --elevation-4: 0 20px 40px rgb(0 0 0 / 0.15);

{theme_vars(LIGHT, status_light, False)}

{glass_vars('light')}

  /* sidebar (shadcn compatibility) */
  --sidebar: var(--card);
  --sidebar-foreground: var(--card-foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--accent-foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);

  /* charts -> category ramp, so charts and taxonomy agree */
  --chart-1: var(--cat-1);
  --chart-2: var(--cat-2);
  --chart-3: var(--cat-3);
  --chart-4: var(--cat-4);
  --chart-5: var(--cat-5);
}}

.dark {{
  /* Dark is a set of desaturated tonal variants, not an inversion (MASTER §2.4).
     Shadows are weakened; depth comes from surface lightness instead. */
  --elevation-1: 0 1px 3px rgb(0 0 0 / 0.40);
  --elevation-2: 0 4px 6px rgb(0 0 0 / 0.45);
  --elevation-3: 0 10px 20px rgb(0 0 0 / 0.50);
  --elevation-4: 0 20px 40px rgb(0 0 0 / 0.60);

{theme_vars(DARK, status_dark, True)}

{glass_vars('dark')}

  --sidebar: var(--card);
  --sidebar-foreground: var(--card-foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--accent-foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);

  --chart-1: var(--cat-1);
  --chart-2: var(--cat-2);
  --chart-3: var(--cat-3);
  --chart-4: var(--cat-4);
  --chart-5: var(--cat-5);
}}

@layer base {{
  * {{
    @apply border-border outline-ring/50;
  }}

  body {{
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    /* Never let the page itself scroll sideways (MASTER §5). */
    overflow-x: hidden;
  }}

  h1, h2, h3, h4 {{
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: -0.011em;
  }}

  /* Counts, prices, tallies and dates must not reflow as they change
     (MASTER §3). Opt in explicitly with .tabular where needed. */
  .tabular,
  time,
  [data-numeric] {{
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }}

  button:not(:disabled),
  [role="button"]:not([aria-disabled="true"]),
  [type="button"]:not(:disabled),
  [type="submit"]:not(:disabled),
  [type="reset"]:not(:disabled),
  a[href],
  select:not(:disabled),
  input[type="checkbox"]:not(:disabled),
  input[type="radio"]:not(:disabled) {{
    @apply cursor-pointer;
  }}

  /* Reduce the tap-highlight flash; real press feedback is per-component. */
  button, [role="button"], a {{
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }}
}}

/* --------------------------------------------------------------------------
   Safe-area utilities

   Names and semantics are master's, not this branch's: MobileNav and the
   legal/native screens already reference `safe-area-bottom`, and the max()
   floor is a real refinement — on a device with no notch the inset is 0, and a
   bar with no padding sits flush against the screen edge.

   They only resolve to anything non-zero once client/index.html carries
   viewport-fit=cover.
   -------------------------------------------------------------------------- */

@utility safe-area-bottom {{
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 0.5rem);
}}

@utility safe-area-top {{
  padding-top: env(safe-area-inset-top, 0px);
}}

@utility safe-area-x {{
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}}

/* Bottom clearance for scroll content sitting above the floating tab bar,
   driven by one token so no screen has to guess the nav height. */
@utility pb-nav {{
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 1rem);
}}

/* Offset for elements anchored just above the tab bar (FAB, sticky bars). */
@utility bottom-nav {{
  bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 0.75rem);
}}

/* --------------------------------------------------------------------------
   Glass and gradient

   Blur is used only where it carries meaning — a surface with content behind
   it (MASTER §4). The hairline is what stops a glass panel reading as a flat
   translucent rectangle: a 1px light edge at the top catches the "pane".
   -------------------------------------------------------------------------- */

@utility glass {{
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  border: 1px solid var(--glass-hairline);
}}

/* Glass without a full border — for bars that only need a bottom/top edge. */
@utility glass-flat {{
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
}}

@utility grad-brand {{
  background-image: var(--grad-brand);
}}

@utility grad-accent {{
  background-image: var(--grad-accent);
}}

@utility grad-cool {{
  background-image: var(--grad-cool);
}}

@utility grad-surface {{
  background-image: var(--grad-surface);
}}

/* Gradient lettering for a single hero line. Falls back to a solid colour
   where background-clip:text is unsupported. */
@utility text-grad-brand {{
  background-image: var(--grad-brand);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}}

/* Expands the tappable area of a visually small control to >=44px without
   changing its painted size (MASTER §1, §8). */
@utility touch-target {{
  position: relative;
}}

@utility touch-target {{
  &::after {{
    content: "";
    position: absolute;
    inset: 50%;
    width: max(100%, 2.75rem);
    height: max(100%, 2.75rem);
    transform: translate(-50%, -50%);
  }}
}}

@layer components {{
  .container {{
    width: 100%;
    margin-left: auto;
    margin-right: auto;
    padding-left: 1rem;
    padding-right: 1rem;
  }}

  /* NOTE: this global override props up truncation/overflow behaviour across
     every screen. Scheduled for removal in the final phase, once each screen
     declares its own min-w-0 explicitly. Do not remove early. */
  .flex {{
    min-height: 0;
    min-width: 0;
  }}

  @media (min-width: 640px) {{
    .container {{
      padding-left: 1.5rem;
      padding-right: 1.5rem;
    }}
  }}

  @media (min-width: 1024px) {{
    .container {{
      padding-left: 2rem;
      padding-right: 2rem;
      max-width: 1280px;
    }}
  }}
}}

/* --------------------------------------------------------------------------
   Reduced motion (MASTER §7)

   Motion must never be required to understand the interface.
   -------------------------------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {{
  *,
  *::before,
  *::after {{
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }}

  :root {{
    --motion-fast: 0.01ms;
    --motion-base: 0.01ms;
    --motion-slow: 0.01ms;
  }}
}}
"""

dest = os.path.join("..", "client", "src", "index.css")
with open(dest, "w", encoding="utf-8", newline="\n") as f:
    f.write(CSS)
print(f"wrote {dest}  ({len(CSS.splitlines())} lines)")
