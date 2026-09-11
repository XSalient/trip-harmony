exec(open('color.py').read())

def hx(L,C,H):
    r,g,b = oklch_rgb(L,C,H)
    return '#%02X%02X%02X'%(r,g,b), (r,g,b)

def ok(L,C,H): return f'oklch({L:.3f} {C:.3f} {H:.1f})'

# Hue anchors. Adopted from the reference design on
# origin/redesign/mobile-ui-system: violet brand, coral and lagoon accents,
# violet-tinted neutrals. Lightness is re-solved here so every pair clears WCAG
# AA — that verification is what this file adds on top of the reference.
H_BRAND, H_CORAL, H_LAGOON = 286.0, 33.0, 205.0
H_SUCCESS, H_WARN, H_DANGER, H_INFO = 178.0, 68.0, 24.0, 255.0
NEUTRAL_H, NEUTRAL_C = 285.0, 0.008     # violet-tinted neutral ramp

LIGHT = {
 'background':        (0.985, 0.006, 285.0),
 'foreground':        (0.220, 0.032, 278.0),
 'card':              (1.000, 0.000, 89.9),
 'card-foreground':   (0.220, 0.032, 278.0),
 'popover':           (1.000, 0.000, 89.9),
 'popover-foreground':(0.220, 0.032, 278.0),
 'primary':           (0.500, 0.190, H_BRAND),
 'primary-foreground':(0.990, 0.000, 89.9),
 'secondary':         (0.955, 0.022, H_BRAND),
 'secondary-foreground':(0.400, 0.140, H_BRAND),
 'muted':             (0.966, 0.007, H_BRAND),
 'muted-foreground':  (0.495, 0.026, 282.0),
 'accent':            (0.958, 0.030, 34.0),
 'accent-foreground': (0.420, 0.150, 34.0),
 'destructive':       (0.550, 0.210, H_DANGER),
 'destructive-foreground':(0.990, 0.000, 89.9),
 'border':            (0.861, 0.012, H_BRAND),
 'input':             (0.861, 0.012, H_BRAND),
 'ring':              (0.500, 0.190, H_BRAND),
 'coral':             (0.580, 0.190, H_CORAL),
 'coral-foreground':  (0.990, 0.000, 89.9),
 'lagoon':            (0.537, 0.120, H_LAGOON),
 'lagoon-foreground': (0.990, 0.000, 89.9),
}
DARK = {
 'background':        (0.165, 0.021, 282.0),
 'foreground':        (0.965, 0.007, H_BRAND),
 'card':              (0.215, 0.024, 283.0),
 'card-foreground':   (0.965, 0.007, H_BRAND),
 'popover':           (0.215, 0.024, 283.0),
 'popover-foreground':(0.965, 0.007, H_BRAND),
 'primary':           (0.740, 0.155, 288.0),
 'primary-foreground':(0.170, 0.045, 285.0),
 'secondary':         (0.290, 0.045, H_BRAND),
 'secondary-foreground':(0.900, 0.050, 288.0),
 'muted':             (0.260, 0.022, 283.0),
 'muted-foreground':  (0.720, 0.022, 285.0),
 'accent':            (0.310, 0.055, 34.0),
 'accent-foreground': (0.870, 0.090, 40.0),
 'destructive':       (0.700, 0.185, H_DANGER),
 'destructive-foreground':(0.170, 0.040, H_DANGER),
 'border':            (0.346, 0.024, 284.0),
 'input':             (0.365, 0.024, 284.0),
 'ring':              (0.740, 0.155, 288.0),
 'coral':             (0.720, 0.165, H_CORAL),
 'coral-foreground':  (0.180, 0.040, H_CORAL),
 'lagoon':            (0.720, 0.110, H_LAGOON),
 'lagoon-foreground': (0.170, 0.035, H_LAGOON),
}

STATUS_H = {'success':H_SUCCESS,'warning':H_WARN,'danger':H_DANGER,'info':H_INFO}
STATUS_C = {'success':0.140,'warning':0.140,'danger':0.200,'info':0.160}
# Lightness solved so BOTH hold in light mode:
#   white-on-base >= 4.5  (base used as a solid fill with white text)
#   base-on-soft  >= 4.5  (base used as text inside its own soft surface)
STATUS_L = {H_SUCCESS:0.504, H_WARN:0.530, H_DANGER:0.545, H_INFO:0.520}
def status_light(h,c):
    return {'':(STATUS_L[h],c,h), '-foreground':(1.000,0.000,89.9),
            '-soft':(0.955,min(c*0.22,0.035),h), '-on-soft':(0.420,c*0.72,h),
            '-border':(0.885,min(c*0.35,0.055),h)}
def status_dark(h,c):
    # Dark soft fills are darker and MORE chromatic than the first pass, which
    # used L 0.300 at a chroma capped near 0.045. On a card at L 0.21 that read
    # as a pale brown or grey patch sitting on the surface rather than as a
    # tint of the status colour — amber in particular came out mud. Chroma is
    # what carries hue at low lightness, so the fix is to drop L towards the
    # card and let C rise. Contrast only improves: `-on-soft` (L 0.88) and the
    # base (L 0.72) both sit above it, so darkening the fill widens both pairs.
    return {'':(0.720,c*0.88,h), '-foreground':(0.185,c*0.18,h),
            '-soft':(0.262,min(c*0.44,0.062),h), '-on-soft':(0.880,c*0.42,h),
            '-border':(0.355,min(c*0.55,0.082),h)}
# category ramp (budget categories / notification types / itinerary item types)
CAT_H = [286.0, 33.0, 178.0, 320.0, 205.0, 68.0]
CAT_L = [0.500,0.544,0.504,0.548,0.503,0.530]  # same two constraints as STATUS_L
def cat(i, dark):
    h = CAT_H[i]
    # Same reasoning as `status_dark`: soft fills sit near the card's lightness
    # and carry their hue in chroma rather than in lightness.
    return ((0.700,0.120,h),(0.185,0.020,h),(0.262,0.058,h),(0.880,0.060,h)) if dark \
      else ((CAT_L[i],0.140,h),(1.000,0.000,89.9),(0.955,0.032,h),(0.420,0.100,h))


def verify(verbose=False):
    """Contrast-check every token pair the UI can actually produce.

    Returns the list of failures; empty means the palette is sound.
    """
    def rgb(t):
        return hx(*t)[1]

    fails, n = [], 0

    def chk(theme, label, fg, bg, need=4.5):
        nonlocal n
        n += 1
        r = contrast(fg, bg)
        if verbose:
            print(f"  {theme:5} {label:44} {r:5.2f}:1 need {need}")
        if r < need:
            fails.append((theme, label, round(r, 2), need))

    for theme, D in (("LIGHT", LIGHT), ("DARK", DARK)):
        bg, card = rgb(D["background"]), rgb(D["card"])
        chk(theme, "foreground / background", rgb(D["foreground"]), bg)
        chk(theme, "card-foreground / card", rgb(D["card-foreground"]), card)
        chk(theme, "muted-foreground / background", rgb(D["muted-foreground"]), bg)
        chk(theme, "muted-foreground / card", rgb(D["muted-foreground"]), card)
        chk(theme, "muted-foreground / muted", rgb(D["muted-foreground"]), rgb(D["muted"]))
        for p in ("primary", "secondary", "accent", "destructive", "coral", "lagoon"):
            chk(theme, f"{p}-foreground / {p}", rgb(D[p + "-foreground"]), rgb(D[p]))
        chk(theme, "primary / background (UI)", rgb(D["primary"]), bg, 3.0)
        chk(theme, "ring / background (UI)", rgb(D["ring"]), bg, 3.0)
        chk(theme, "border / card (divider)", rgb(D["border"]), card, 1.5)
        chk(theme, "input / card (divider)", rgb(D["input"]), card, 1.5)

    for theme, fn, D in (("LIGHT", status_light, LIGHT), ("DARK", status_dark, DARK)):
        for name, h in STATUS_H.items():
            s = fn(h, STATUS_C[name])
            chk(theme, f"{name}-foreground / {name}", rgb(s["-foreground"]), rgb(s[""]))
            chk(theme, f"{name}-on-soft / {name}-soft", rgb(s["-on-soft"]), rgb(s["-soft"]))
            # base used as text inside its own soft surface
            chk(theme, f"{name} / {name}-soft", rgb(s[""]), rgb(s["-soft"]))
            chk(theme, f"{name} / background (UI)", rgb(s[""]), rgb(D["background"]), 3.0)

    for theme, dark in (("LIGHT", False), ("DARK", True)):
        for i in range(6):
            base, fg, soft, on_soft = cat(i, dark)
            chk(theme, f"cat-{i+1}-foreground / cat-{i+1}", rgb(fg), rgb(base))
            chk(theme, f"cat-{i+1}-on-soft / soft", rgb(on_soft), rgb(soft))
            chk(theme, f"cat-{i+1} / cat-{i+1}-soft", rgb(base), rgb(soft))

    # Glass: verify against the composited colour, not the nominal token.
    for theme, D, key in (("LIGHT", LIGHT, "light"), ("DARK", DARK, "dark")):
        g = GLASS[key]
        tint = rgb(g["tint"])
        over_bg = composite(tint, g["alpha"], rgb(D["background"]))
        over_card = composite(tint, g["alpha"], rgb(D["card"]))
        chk(theme, "foreground / glass over background", rgb(D["foreground"]), over_bg)
        chk(theme, "foreground / glass over card", rgb(D["foreground"]), over_card)
        chk(theme, "muted-foreground / glass over background",
            rgb(D["muted-foreground"]), over_bg)

    # Gradient stops: a gradient button is only as accessible as its lightest
    # stop, so both ends are checked against the text that sits on them.
    import re as _re

    def _parse(s):
        m = _re.match(r"oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)", s)
        return tuple(float(x) for x in m.groups())

    for theme, dark, fg in (("LIGHT", False, (255, 255, 255)),
                            ("DARK", True, rgb(DARK["primary-foreground"]))):
        for name, (a, b) in gradients(dark).items():
            if name == "surface":
                continue
            for label, stop in (("from", a), ("to", b)):
                chk(theme, f"grad-{name} {label} / its text", fg, rgb(_parse(stop)))

    print(f"contrast checks: {n}   failures: {len(fails)}")
    for f in fails:
        print("  FAIL", f)
    return fails


# --------------------------------------------------------------------------
# Glass + gradient layer
#
# Translucency is only used where it means "there is content behind this":
# the sticky header, the floating tab bar, sheets and their scrims. The alpha
# is deliberately high (0.72-0.78) — low-alpha glass is what makes text on
# these surfaces fail contrast once a photo scrolls underneath.
# --------------------------------------------------------------------------

GLASS = {
    "light": {
        "tint": (1.000, 0.000, 89.9),   # white
        "alpha": 0.78,
        "alpha-strong": 0.94,
        "hairline": "oklch(1 0 0 / 0.70)",
        "blur": "20px",
    },
    "dark": {
        "tint": (0.240, 0.026, 283.0),  # violet-tinted, matching the surfaces
        "alpha": 0.80,
        "alpha-strong": 0.95,
        "hairline": "oklch(1 0 0 / 0.09)",
        "blur": "20px",
    },
}

# Atmosphere. The aurora washes and the brand glow are what make the dark
# surfaces read as lit rather than flat; the shadow tint is violet so shadows
# belong to the palette instead of being neutral grey.
ATMOSPHERE = {
    "light": {
        "brand-glow": "oklch(0.50 0.19 286 / 0.28)",
        "shadow-tint": "oklch(0.35 0.06 285 / 0.12)",
        "shadow-tint-weak": "oklch(0.35 0.06 285 / 0.07)",
        "shadow-tint-strong": "oklch(0.35 0.06 285 / 0.18)",
        "aurora-1": "oklch(0.72 0.17 286 / 0.50)",
        "aurora-2": "oklch(0.78 0.15 33 / 0.42)",
        "aurora-3": "oklch(0.80 0.11 205 / 0.42)",
    },
    "dark": {
        "brand-glow": "oklch(0.60 0.20 288 / 0.42)",
        "shadow-tint": "oklch(0.05 0.02 280 / 0.50)",
        "shadow-tint-weak": "oklch(0.05 0.02 280 / 0.32)",
        "shadow-tint-strong": "oklch(0.02 0.01 280 / 0.65)",
        "aurora-1": "oklch(0.60 0.20 288 / 0.34)",
        "aurora-2": "oklch(0.62 0.18 33 / 0.26)",
        "aurora-3": "oklch(0.60 0.13 205 / 0.26)",
    },
}

# Two-stop brand gradients. Hues stay inside the palette so a gradient never
# introduces a colour the token system has not verified.
def gradients(dark):
    """Two-stop brand gradients.

    Hues stay inside the palette, and the lightness of each stop is solved so
    that the gradient's own foreground clears 4.5:1 at BOTH ends — a gradient
    button is only as accessible as its lightest stop, which is the usual way
    these fail. Verified by verify_tokens.py.
    """
    if dark:
        return {
            "brand": ("oklch(0.603 0.190 286.0)", "oklch(0.608 0.190 33.0)"),
            "accent": ("oklch(0.608 0.190 33.0)", "oklch(0.593 0.150 68.0)"),
            "cool": ("oklch(0.568 0.120 205.0)", "oklch(0.603 0.190 286.0)"),
            "surface": ("oklch(0.245 0.030 285.0)", "oklch(0.195 0.022 282.0)"),
        }
    return {
            "brand": ("oklch(0.572 0.190 286.0)", "oklch(0.577 0.190 33.0)"),
            "accent": ("oklch(0.577 0.190 33.0)", "oklch(0.562 0.150 68.0)"),
            "cool": ("oklch(0.534 0.120 205.0)", "oklch(0.572 0.190 286.0)"),
            "surface": ("oklch(0.995 0.006 285.0)", "oklch(0.972 0.012 286.0)"),
        }
