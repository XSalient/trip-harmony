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
        f'  --glass-bg-strong: oklch({L:.3f} {C:.3f} {H:.1f} / {g["alpha-strong"]});',
        f'  --glass-hairline: {g["hairline"]};',
        f'  --glass-blur: {g["blur"]};',
        f'  --scrim: oklch(0 0 0 / {0.62 if dark else 0.45});',
    ]
    for name, (a, b) in gradients(dark).items():
        out.append(f'  --grad-{name}: linear-gradient(135deg, {a} 0%, {b} 100%);')
    # Atmosphere: aurora washes, the brand glow and the violet shadow tints.
    for name, value in ATMOSPHERE[key].items():
        out.append(f'  --{name}: {value};')
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
  --radius-3xl: calc(var(--radius) + 20px);

  /* elevation scale (MASTER §4) */
  --shadow-e1: var(--elevation-1);
  --shadow-e2: var(--elevation-2);
  --shadow-e3: var(--elevation-3);
  --shadow-e4: var(--elevation-4);
  --shadow-glow: var(--elevation-glow);

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

  /* Elevation is layered and violet-tinted, so shadows belong to the palette
     rather than being neutral grey. Values follow the reference design. */
  --elevation-1: 0 1px 2px -1px var(--shadow-tint-weak), 0 1px 3px var(--shadow-tint-weak);
  --elevation-2: 0 2px 4px -2px var(--shadow-tint-weak), 0 6px 16px -6px var(--shadow-tint);
  --elevation-3: 0 4px 10px -4px var(--shadow-tint), 0 16px 32px -12px var(--shadow-tint);
  --elevation-4: 0 8px 20px -8px var(--shadow-tint), 0 28px 56px -20px var(--shadow-tint-strong);
  --elevation-glow: 0 8px 24px -6px var(--brand-glow);

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
  /* Dark is a set of tonal variants, not an inversion (MASTER §2.4). The
     elevation formulas are shared; only the tint underneath them changes. */

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
    /* Long-pressing a control should not offer to copy its label or show the
       iOS link callout — that is document behaviour, not app behaviour. */
    -webkit-touch-callout: none;
    user-select: none;
  }}

  /* Chrome is furniture: you do not select a tab bar's labels. Content stays
     selectable, so anything worth copying still can be. */
  nav, header, [role="tablist"], [data-slot="badge"] {{
    user-select: none;
    -webkit-user-select: none;
  }}

  html {{
    /* No rubber-band past the ends of the document. In a browser this reveals
       the page background; in a WebView it reveals the native scroll view. Both
       read as "this is a web page inside something". */
    overscroll-behavior-y: none;
    /* A scrollbar track down the side of a phone screen is a website tell. */
    scrollbar-width: none;
  }}

  html::-webkit-scrollbar {{
    display: none;
  }}

  body {{
    overscroll-behavior-y: none;
  }}

  /* Anything that scrolls inside the page keeps its momentum and does not
     chain its overscroll to the document underneath. */
  [data-scroll], .overflow-y-auto, .overflow-auto {{
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
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
   Screen transitions

   A single-page app that simply repaints on navigation reads as a website.
   Real apps move: forward slides in from the trailing edge, back from the
   leading one. Transform and opacity only, and the incoming screen is animated
   rather than cross-fading two trees, so nothing is ever left mounted twice.
   -------------------------------------------------------------------------- */

@keyframes screen-in-forward {{
  from {{ transform: translate3d(18px, 0, 0); opacity: 0.4; }}
  to   {{ transform: translate3d(0, 0, 0); opacity: 1; }}
}}

@keyframes screen-in-back {{
  from {{ transform: translate3d(-18px, 0, 0); opacity: 0.4; }}
  to   {{ transform: translate3d(0, 0, 0); opacity: 1; }}
}}

@utility screen-forward {{
  animation: screen-in-forward 260ms var(--ease-out-soft) both;
}}

@utility screen-back {{
  animation: screen-in-back 260ms var(--ease-out-soft) both;
}}

@media (prefers-reduced-motion: reduce) {{
  .screen-forward,
  .screen-back {{
    animation: none;
  }}
}}

/* --------------------------------------------------------------------------
   Entrance animation

   CSS rather than JS. Two reasons: it keeps framer-motion out of the entry
   chunk (Home is eager, so anything it imports ships on first paint), and a
   CSS animation with fill-mode:both cannot leave content stuck part-way the
   way a throttled requestAnimationFrame can.

   Transform only — never opacity — so content is readable even if the
   animation never runs at all.
   -------------------------------------------------------------------------- */

@keyframes harmony-rise {{
  from {{ transform: translateY(14px); }}
  to {{ transform: translateY(0); }}
}}

@utility animate-rise {{
  animation: harmony-rise var(--motion-base) var(--ease-out-soft) both;
}}

/* Stagger via a custom property the caller sets per item:
   style={{{{ "--i": index }}}} */
@utility stagger-item {{
  animation: harmony-rise var(--motion-base) var(--ease-out-soft) both;
  animation-delay: calc(min(var(--i, 0), 8) * 45ms);
}}

@media (prefers-reduced-motion: reduce) {{
  .animate-rise,
  .stagger-item {{
    animation: none;
  }}
}}

/* --------------------------------------------------------------------------
   Modal surfaces

   A centred box that zooms in is a desktop idiom. On a phone the same content
   belongs on a sheet that rises from the bottom edge, within thumb reach, with
   a grabber that says "drag me down". `sheet-surface` is one utility that is a
   sheet below `sm` and the familiar centred dialog above it, so every existing
   Dialog call site gets the native behaviour without being rewritten.

   The open/close animations hang off Radix's `data-state` rather than being a
   bare `animation:` — Radix's Presence waits for a running animation before it
   unmounts, so this is what makes the sheet slide back down instead of
   vanishing.
   -------------------------------------------------------------------------- */

@keyframes sheet-up {{
  from {{ transform: translate3d(0, 100%, 0); }}
  to   {{ transform: translate3d(0, 0, 0); }}
}}

@keyframes sheet-down {{
  from {{ transform: translate3d(0, 0, 0); }}
  to   {{ transform: translate3d(0, 100%, 0); }}
}}

/* Transform only, never opacity. A keyframe that starts at opacity 0 leaves
   the surface invisible if the animation never runs — and it does not run in a
   background tab, in low-power mode, or in some in-app WebViews. Stuck at
   `scale(0.96)` is still a readable dialog; stuck at `opacity: 0` is a bug
   report. Same rule as `harmony-rise`. */
@keyframes dialog-in {{
  from {{ transform: translate(-50%, -50%) scale(0.96); }}
  to   {{ transform: translate(-50%, -50%) scale(1); }}
}}

@keyframes dialog-out {{
  from {{ transform: translate(-50%, -50%) scale(1); }}
  to   {{ transform: translate(-50%, -50%) scale(0.96); }}
}}

@utility sheet-surface {{
  position: fixed;
  z-index: 50;
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  width: 100%;
  max-width: none;
  max-height: 88dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 28px 28px 0 0;
  background: var(--card);
  box-shadow: var(--shadow-e4);
  padding: 0.5rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px));

  /* No fill mode on the entrance: `both` would hold the start frame — the
     sheet parked a full height below the viewport — for as long as the
     animation is pending, which in a throttled tab is forever. Without it the
     resting position is the correct one and the animation is pure gravy. */
  &[data-state="open"] {{
    animation: sheet-up var(--motion-slow) var(--ease-out-soft);
  }}
  &[data-state="closed"] {{
    animation: sheet-down var(--motion-base) var(--ease-in-soft) forwards;
  }}

  /* The grabber. Sticky so it stays put while the sheet's body scrolls. */
  &::before {{
    content: "";
    position: sticky;
    top: 0;
    z-index: 1;
    display: block;
    width: 2.25rem;
    height: 0.25rem;
    margin: 0 auto 0.625rem;
    border-radius: 999px;
    background: var(--border);
  }}

  @media (min-width: 40rem) {{
    left: 50%;
    right: auto;
    top: 50%;
    bottom: auto;
    transform: translate(-50%, -50%);
    max-width: 32rem;
    max-height: 85dvh;
    border: 1px solid var(--border);
    border-radius: var(--radius-2xl);
    padding: 1.5rem;

    &[data-state="open"] {{
      animation: dialog-in var(--motion-base) var(--ease-out-soft);
    }}
    &[data-state="closed"] {{
      animation: dialog-out var(--motion-fast) var(--ease-in-soft) forwards;
    }}
    &::before {{ display: none; }}
  }}
}}

@media (prefers-reduced-motion: reduce) {{
  .sheet-surface[data-state="open"],
  .sheet-surface[data-state="closed"] {{
    animation-duration: 1ms;
  }}
}}

/* --------------------------------------------------------------------------
   Press feedback

   The single clearest tell that a screen is a web page: tapping something and
   watching nothing happen until the network answers. Every tappable surface
   dips under the finger, immediately, on the compositor (MASTER S7).

   `touch-action: manipulation` is part of the same job — it removes the 300ms
   double-tap wait, so the dip and the action land together.
   -------------------------------------------------------------------------- */

@utility pressable {{
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--motion-fast) var(--ease-out-soft);

  &:active {{
    transform: scale(0.97);
  }}
}}

/* For large surfaces — a full-width card dipping 3% reads as a glitch. */
@utility pressable-lg {{
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--motion-fast) var(--ease-out-soft);

  &:active {{
    transform: scale(0.985);
  }}
}}

@media (prefers-reduced-motion: reduce) {{
  .pressable:active,
  .pressable-lg:active {{
    transform: none;
  }}
}}

/* --------------------------------------------------------------------------
   Live dot

   A small solid dot with a ring expanding out of it: the one place in the app
   where a looping animation earns its keep, because "something is waiting on
   you" is a state rather than an event and the loop is what says so.
   -------------------------------------------------------------------------- */

@keyframes live-ping {{
  0%   {{ transform: scale(1); opacity: 0.55; }}
  70%  {{ transform: scale(2.6); opacity: 0; }}
  100% {{ transform: scale(2.6); opacity: 0; }}
}}

@utility live-dot {{
  position: relative;
  display: block;
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;

  &::after {{
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    background: inherit;
    animation: live-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }}
}}

@media (prefers-reduced-motion: reduce) {{
  .live-dot::after {{ animation: none; opacity: 0; }}
}}

/* --------------------------------------------------------------------------
   Loading

   A skeleton that pulses its opacity reads as a broken element. A sheen that
   travels across it reads as work in progress, which is what it is.
   -------------------------------------------------------------------------- */

@keyframes shimmer {{
  from {{ transform: translateX(-100%); }}
  to   {{ transform: translateX(100%); }}
}}

@utility shimmer {{
  position: relative;
  overflow: hidden;

  &::after {{
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background-image: linear-gradient(
      90deg,
      transparent,
      var(--glass-hairline),
      transparent
    );
    animation: shimmer 1.6s infinite;
  }}
}}

@media (prefers-reduced-motion: reduce) {{
  .shimmer::after {{ animation: none; }}
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
/* Full-width bars sit directly over scrolling text, where a light tint lets
   content ghost through. Denser, and still translucent enough to read as glass. */
@utility glass-flat {{
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
}}

/* Ambient aurora for hero surfaces. Three soft radial washes, positioned by
   the caller; pointer-events-none and aria-hidden at the call site. */
@utility aurora {{
  position: relative;
  isolation: isolate;
}}

@utility aurora-blob {{
  position: absolute;
  border-radius: 9999px;
  filter: blur(64px);
  pointer-events: none;
}}

/* A brand-tinted glow under the primary action, so it reads as lit. */
@utility glow {{
  box-shadow: var(--elevation-glow);
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
