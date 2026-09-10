exec(open('color.py').read())

def hx(L,C,H):
    r,g,b = oklch_rgb(L,C,H)
    return '#%02X%02X%02X'%(r,g,b), (r,g,b)

def ok(L,C,H): return f'oklch({L:.3f} {C:.3f} {H:.1f})'

# hue anchors (from ui-ux-pro-max "Road Trip Planner" product palette)
H_BRAND, H_TEAL, H_AMBER = 41.1, 221.7, 58.3
H_SUCCESS, H_WARN, H_DANGER, H_INFO = 152.0, 75.0, 27.3, 240.0
NEUTRAL_H, NEUTRAL_C = 70.0, 0.010     # warm neutral ramp

LIGHT = {
 'background':        (0.980, 0.016, 73.7),
 'foreground':        (0.230, 0.030, 265.0),
 'card':              (1.000, 0.000, 89.9),
 'card-foreground':   (0.230, 0.030, 265.0),
 'popover':           (1.000, 0.000, 89.9),
 'popover-foreground':(0.230, 0.030, 265.0),
 'primary':           (0.584, 0.165, H_BRAND),
 'primary-foreground':(1.000, 0.000, 89.9),
 'secondary':         (0.958, 0.022, H_BRAND),
 'secondary-foreground':(0.400, 0.100, H_BRAND),
 'muted':             (0.966, 0.008, NEUTRAL_H),
 'muted-foreground':  (0.500, 0.025, 258.0),
 'accent':            (0.955, 0.030, H_AMBER),
 'accent-foreground': (0.420, 0.110, H_AMBER),
 'destructive':       (0.545, 0.205, H_DANGER),
 'destructive-foreground':(1.000, 0.000, 89.9),
 'border':            (0.865, 0.012, NEUTRAL_H),
 'input':             (0.865, 0.012, NEUTRAL_H),
 'ring':              (0.584, 0.165, H_BRAND),
 'brand-teal':        (0.558, 0.111, H_TEAL),
 'brand-teal-foreground':(1.000,0.000,89.9),
}
DARK = {
 'background':        (0.185, 0.012, 60.0),
 'foreground':        (0.950, 0.008, 75.0),
 'card':              (0.228, 0.014, 60.0),
 'card-foreground':   (0.950, 0.008, 75.0),
 'popover':           (0.228, 0.014, 60.0),
 'popover-foreground':(0.950, 0.008, 75.0),
 'primary':           (0.720, 0.150, H_BRAND),
 'primary-foreground':(0.200, 0.030, H_BRAND),
 'secondary':         (0.290, 0.030, H_BRAND),
 'secondary-foreground':(0.900, 0.030, H_BRAND),
 'muted':             (0.275, 0.010, NEUTRAL_H),
 'muted-foreground':  (0.720, 0.020, 258.0),
 'accent':            (0.300, 0.035, H_AMBER),
 'accent-foreground': (0.900, 0.040, H_AMBER),
 'destructive':       (0.680, 0.185, H_DANGER),
 'destructive-foreground':(0.180, 0.030, H_DANGER),
 'border':            (0.350, 0.012, NEUTRAL_H),
 'input':             (0.375, 0.012, NEUTRAL_H),
 'ring':              (0.720, 0.150, H_BRAND),
 'brand-teal':        (0.700, 0.105, H_TEAL),
 'brand-teal-foreground':(0.180,0.030,H_TEAL),
}
# status scales: base / foreground(on base) / soft(surface) / on-soft / border
STATUS_H = {'success':H_SUCCESS,'warning':H_WARN,'danger':H_DANGER,'info':H_INFO}
STATUS_C = {'success':0.130,'warning':0.140,'danger':0.205,'info':0.150}
# Lightness solved so BOTH hold in light mode:
#   white-on-base >= 4.5  (base used as a solid fill with white text)
#   base-on-soft  >= 4.5  (base used as text inside its own soft surface)
STATUS_L = {152.0:0.524, 75.0:0.541, 27.3:0.555, 240.0:0.527}
def status_light(h,c):
    return {'':(STATUS_L[h],c,h), '-foreground':(1.000,0.000,89.9),
            '-soft':(0.955,min(c*0.22,0.035),h), '-on-soft':(0.420,c*0.72,h),
            '-border':(0.885,min(c*0.35,0.055),h)}
def status_dark(h,c):
    return {'':(0.720,c*0.88,h), '-foreground':(0.185,c*0.18,h),
            '-soft':(0.300,min(c*0.26,0.045),h), '-on-soft':(0.880,c*0.42,h),
            '-border':(0.380,min(c*0.40,0.065),h)}
# category ramp (budget categories / notification types / itinerary item types)
CAT_H = [259.0, 25.0, 152.0, 300.0, 200.0, 95.0]
CAT_L = [0.539,0.547,0.522,0.548,0.506,0.536]  # same two constraints as STATUS_L
def cat(i, dark):
    h = CAT_H[i]
    return ((0.700,0.120,h),(0.185,0.020,h),(0.300,0.040,h),(0.880,0.060,h)) if dark \
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
        for p in ("primary", "secondary", "accent", "destructive", "brand-teal"):
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

    print(f"contrast checks: {n}   failures: {len(fails)}")
    for f in fails:
        print("  FAIL", f)
    return fails

