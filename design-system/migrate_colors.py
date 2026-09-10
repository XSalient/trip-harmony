"""One-shot migration: raw Tailwind palette classes -> semantic design tokens.

Run from the design-system/ directory:

    python migrate_colors.py [--dry-run]

Phase 3 of the redesign. This is a *colour-only* transformation: no layout,
markup or logic changes. After it runs, MASTER.md §11's first grep guard must
return nothing, and every screen must look identical in light mode while dark
mode becomes coherent for the first time.

Two kinds of rule:

  FILE_RULES    taxonomy maps, where the right token depends on what the entry
                *means* (a budget category is not a status). Applied first.
  GLOBAL_RULES  the mechanical remainder, longest-match-first.

`dark:` palette variants are deleted rather than translated: the .dark token
block now handles theming, so they are redundant by construction.
"""
import os
import re
import sys

SRC = os.path.join("..", "client", "src")
DRY = "--dry-run" in sys.argv

# --------------------------------------------------------------------------
# 1. Taxonomy maps — meaning decides the token, so these are explicit.
# --------------------------------------------------------------------------
FILE_RULES = {
    "pages/TripBudget.tsx": [
        # Budget categories are taxonomy -> category ramp (MASTER §2.3).
        ('accommodation: "bg-blue-100 text-blue-700"',
         'accommodation: "bg-cat-1-soft text-cat-1-on-soft"'),
        ('transport: "bg-purple-100 text-purple-700"',
         'transport: "bg-cat-5-soft text-cat-5-on-soft"'),
        ('food: "bg-orange-100 text-orange-700"',
         'food: "bg-cat-2-soft text-cat-2-on-soft"'),
        ('activities: "bg-green-100 text-green-700"',
         'activities: "bg-cat-3-soft text-cat-3-on-soft"'),
        ('other: "bg-gray-100 text-gray-700"',
         'other: "bg-cat-6-soft text-cat-6-on-soft"'),
    ],
    "pages/Notifications.tsx": [
        # Invite and vote_request are taxonomy; the other three are genuine
        # states, so they take the status scale.
        ('invite: "bg-blue-100 text-blue-700"',
         'invite: "bg-cat-1-soft text-cat-1-on-soft"'),
        ('vote_request: "bg-purple-100 text-purple-700"',
         'vote_request: "bg-cat-4-soft text-cat-4-on-soft"'),
        ('budget_alert: "bg-red-100 text-red-600"',
         'budget_alert: "bg-danger-soft text-danger-on-soft"'),
        ('consensus: "bg-green-100 text-green-700"',
         'consensus: "bg-success-soft text-success-on-soft"'),
        ('phase_change: "bg-yellow-100 text-yellow-700"',
         'phase_change: "bg-warning-soft text-warning-on-soft"'),
    ],
    "pages/TripItinerary.tsx": [
        # Itinerary item types are taxonomy, never status — even "free".
        ('activity: "bg-blue-100 text-blue-700"',
         'activity: "bg-cat-1-soft text-cat-1-on-soft"'),
        ('food: "bg-orange-100 text-orange-700"',
         'food: "bg-cat-2-soft text-cat-2-on-soft"'),
        ('transport: "bg-purple-100 text-purple-700"',
         'transport: "bg-cat-5-soft text-cat-5-on-soft"'),
        ('accommodation: "bg-green-100 text-green-700"',
         'accommodation: "bg-cat-3-soft text-cat-3-on-soft"'),
        ('free: "bg-gray-100 text-gray-600"',
         'free: "bg-muted text-muted-foreground"'),
    ],
    "pages/TripReferee.tsx": [
        # Referee message types are taxonomy.
        ('nudge: "bg-blue-100 text-blue-700"',
         'nudge: "bg-cat-1-soft text-cat-1-on-soft"'),
        ('mediation: "bg-purple-100 text-purple-700"',
         'mediation: "bg-cat-4-soft text-cat-4-on-soft"'),
        ('compromise: "bg-yellow-100 text-yellow-700"',
         'compromise: "bg-cat-6-soft text-cat-6-on-soft"'),
        ('celebration: "bg-green-100 text-green-700"',
         'celebration: "bg-cat-3-soft text-cat-3-on-soft"'),
        ('summary: "bg-gray-100 text-gray-700"',
         'summary: "bg-muted text-muted-foreground"'),
    ],
    "pages/TripPreferences.tsx": [
        # Section identity per design-system/pages/trip-preferences.md: the
        # sections mean want / prefer / avoid, so status tones carry meaning
        # here. This is the one sanctioned use of status as identity.
        ('color: "text-red-600",\n    bg: "bg-red-50 dark:bg-red-950/30",\n    border: "border-red-200 dark:border-red-800",',
         'color: "text-success",\n    bg: "bg-success-soft",\n    border: "border-success-border",'),
        ('color: "text-amber-600",\n    bg: "bg-amber-50 dark:bg-amber-950/30",\n    border: "border-amber-200 dark:border-amber-800",',
         'color: "text-info",\n    bg: "bg-info-soft",\n    border: "border-info-border",'),
        ('color: "text-orange-600",\n    bg: "bg-orange-50 dark:bg-orange-950/30",\n    border: "border-orange-200 dark:border-orange-800",',
         'color: "text-danger",\n    bg: "bg-danger-soft",\n    border: "border-danger-border",'),
        ('color: "text-blue-600",\n    bg: "bg-blue-50 dark:bg-blue-950/30",\n    border: "border-blue-200 dark:border-blue-800",',
         'color: "text-muted-foreground",\n    bg: "bg-muted",\n    border: "border-border",'),
    ],
    "pages/TripDashboard.tsx": [
        # Section shortcut chips are taxonomy, matched to their destination.
        ("bg-pink-100 dark:bg-pink-900/30 text-pink-600",
         "bg-cat-4-soft text-cat-4-on-soft"),
        ("bg-blue-100 dark:bg-blue-900/30 text-blue-600",
         "bg-cat-1-soft text-cat-1-on-soft"),
    ],
    "pages/NotFound.tsx": [
        # Fully off-system; a straight 1:1 onto tokens. The real rewrite comes
        # with the screen redesign.
        ("bg-gradient-to-br from-slate-50 to-slate-100", "bg-background"),
        ("text-slate-900", "text-foreground"),
        ("text-slate-700", "text-foreground"),
        ("text-slate-600", "text-muted-foreground"),
        ("bg-blue-600 hover:bg-blue-700 text-white",
         "bg-primary hover:bg-primary/90 text-primary-foreground"),
    ],
}

# --------------------------------------------------------------------------
# 2. Mechanical remainder. Longest first so pairs win over singletons.
# --------------------------------------------------------------------------
GLOBAL_RULES = [
    # -- paired soft surface + on-soft text ------------------------------
    (r"\bbg-green-100 text-green-(?:600|700)\b", "bg-success-soft text-success-on-soft"),
    (r"\bbg-yellow-100 text-yellow-(?:600|700)\b", "bg-warning-soft text-warning-on-soft"),
    (r"\bbg-red-100 text-red-(?:600|700)\b", "bg-danger-soft text-danger-on-soft"),
    (r"\bbg-orange-100 text-orange-(?:600|700)\b", "bg-warning-soft text-warning-on-soft"),
    (r"\bbg-blue-100 text-blue-(?:600|700)\b", "bg-info-soft text-info-on-soft"),

    # -- soft surfaces ---------------------------------------------------
    (r"\bbg-green-(?:50|100)(?:/\d+)?\b", "bg-success-soft"),
    (r"\bbg-yellow-(?:50|100)(?:/\d+)?\b", "bg-warning-soft"),
    (r"\bbg-amber-(?:50|100)(?:/\d+)?\b", "bg-warning-soft"),
    (r"\bbg-orange-(?:50|100)(?:/\d+)?\b", "bg-warning-soft"),
    (r"\bbg-red-(?:50|100)(?:/\d+)?\b", "bg-danger-soft"),
    (r"\bbg-blue-(?:50|100)(?:/\d+)?\b", "bg-info-soft"),
    (r"\bbg-purple-(?:50|100)(?:/\d+)?\b", "bg-cat-4-soft"),
    (r"\bbg-pink-(?:50|100)(?:/\d+)?\b", "bg-cat-4-soft"),
    (r"\bbg-gray-(?:50|100)(?:/\d+)?\b", "bg-muted"),

    # -- solid fills (progress/vote bars) --------------------------------
    (r"\bbg-green-(?:400|500|600)\b", "bg-success"),
    (r"\bbg-yellow-(?:400|500)\b", "bg-warning"),
    (r"\bbg-amber-(?:400|500)\b", "bg-warning"),
    (r"\bbg-red-(?:400|500)\b", "bg-danger"),

    # -- text ------------------------------------------------------------
    # Deep/pale levels with optional opacity suffixes, as used in master's
    # callouts (text-amber-900/80 and friends).
    (r"\btext-(?:amber|yellow|orange)-(?:100|200|900)(?:/\d+)?\b", "text-warning-on-soft"),
    (r"\btext-green-(?:100|200|900)(?:/\d+)?\b", "text-success-on-soft"),
    (r"\btext-red-(?:100|200|900)(?:/\d+)?\b", "text-danger-on-soft"),
    (r"\btext-blue-(?:100|200|900)(?:/\d+)?\b", "text-info-on-soft"),
    (r"\btext-green-(?:500|600|700|800)(?:/\d+)?\b", "text-success"),
    (r"\btext-yellow-(?:500|600|700|800)(?:/\d+)?\b", "text-warning"),
    (r"\btext-amber-(?:300|400|500|600|700|800)\b", "text-warning"),
    (r"\btext-orange-(?:300|400|500|600|700|800)\b", "text-warning"),
    (r"\btext-red-(?:500|600|700|800)(?:/\d+)?\b", "text-danger"),
    (r"\btext-blue-(?:500|600|700|800)(?:/\d+)?\b", "text-info"),
    (r"\btext-purple-(?:500|600|700|800)\b", "text-cat-4"),
    (r"\btext-pink-(?:500|600|700|800)\b", "text-cat-4"),
    (r"\btext-gray-(?:500|600|700|800)\b", "text-muted-foreground"),
    (r"\btext-slate-(?:500|600|700)\b", "text-muted-foreground"),
    (r"\btext-slate-(?:800|900)\b", "text-foreground"),

    # -- hardcoded white/black surfaces ----------------------------------
    # These break dark mode just as badly as palette classes, and are easy to
    # miss because they carry no numeric suffix. Scrims inside components/ui
    # are intentional and left alone.
    (r"\bbg-white(/\d+)?\b", r"bg-card"),
    (r"\btext-white\b", "text-primary-foreground"),

    # Deep/pale levels and opacity suffixes used by master's callouts,
    # e.g. text-amber-900/80 inside a bg-amber-50 panel.
    (r"\btext-(?:amber|yellow|orange)-(?:100|200|800|900)(?:/\d+)?\b", "text-warning-on-soft"),
    (r"\btext-(?:slate|gray|zinc)-(?:900)(?:/\d+)?\b", "text-foreground"),

    # -- borders ---------------------------------------------------------
    (r"\bborder-green-(?:200|300)\b", "border-success-border"),
    (r"\bborder-yellow-(?:200|300)\b", "border-warning-border"),
    (r"\bborder-amber-(?:200|300)\b", "border-warning-border"),
    (r"\bborder-orange-(?:200|300)\b", "border-warning-border"),
    (r"\bborder-red-(?:200|300)\b", "border-danger-border"),
    (r"\bborder-blue-(?:200|300)\b", "border-info-border"),
    (r"\bborder-purple-(?:200|300)\b", "border-cat-4-soft"),
]

# `dark:` palette variants are redundant now that .dark redefines the tokens.
DARK_VARIANT = re.compile(
    r"\s*\bdark:(?:bg|text|border|ring|from|to|via|fill|stroke)-"
    r"(?:red|orange|amber|yellow|green|blue|indigo|purple|pink|slate|gray|zinc)-"
    r"\d+(?:/\d+)?\b"
)

RAW = re.compile(
    r"\b(?:bg|text|border|ring|from|to|via|fill|stroke)-"
    r"(?:red|orange|amber|yellow|green|blue|indigo|purple|pink|slate|gray|zinc)-"
    r"\d+(?:/\d+)?\b"
)


def migrate():
    changed, total_before, total_after = [], 0, 0
    # shared/ is in scope too: shared/votes.ts holds VOTE_TONE, a map of UI
    # class strings. Scanning only client/src left those raw, which is exactly
    # the kind of gap a "0 remaining" count hides.
    roots = [(SRC, ".tsx"), (os.path.join("..", "shared"), ".ts")]
    for base, suffix in roots:
      for root, _dirs, files in os.walk(base):
        for name in sorted(files):
            if not name.endswith(suffix):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, base).replace("\\", "/")
            original = open(path, encoding="utf-8").read()
            total_before += len(RAW.findall(original))
            text = original

            for old, new in FILE_RULES.get(rel, []):
                text = text.replace(old, new)

            text = DARK_VARIANT.sub("", text)

            for pattern, repl in GLOBAL_RULES:
                text = re.sub(pattern, repl, text)

            total_after += len(RAW.findall(text))
            if text != original:
                changed.append((rel, len(RAW.findall(original)), len(RAW.findall(text))))
                if not DRY:
                    with open(path, "w", encoding="utf-8", newline="\n") as f:
                        f.write(text)

    label = "WOULD CHANGE" if DRY else "CHANGED"
    print(f"{label} {len(changed)} files\n")
    print(f"{'file':44}{'before':>8}{'after':>8}")
    for rel, before, after in changed:
        print(f"{rel:44}{before:>8}{after:>8}")
    print(f"\n{'TOTAL raw palette classes':44}{total_before:>8}{total_after:>8}")
    return total_after


if __name__ == "__main__":
    remaining = migrate()
    print("\nRemaining raw classes:", remaining)
