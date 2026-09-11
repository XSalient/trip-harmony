"""Fail if anything in the UI has drifted off the design system.

Run from design-system/:  python check_consistency.py

Exists because "the look is consistent" is a claim that should be checkable
rather than asserted. Every rule here corresponds to something that actually
went wrong at least once:

  raw palette      228 Tailwind palette classes were in the pages originally.
  white/black      bg-white/80 left the 404 card light grey on a dark ground,
                   and the palette grep missed it — no numeric suffix.
  chart slots      chart-* are recharts series colours, not a badge palette;
                   two badges reached for them and sat outside the tone system.
  viewport-height  100vh jumps as mobile browser chrome hides.
  scrims           dialog and drawer were moved to --scrim while alert-dialog
                   and sheet were not, so overlays did not match each other.

A rule for "status tones must go through a component's `tone` prop" was tried
and removed: it flagged 52 call sites and every one was correct. Applying a
semantic token directly is what tokens are for; the drift worth catching is a
raw palette class, which rule 1 already covers.
"""
import os
import re
import sys

ROOTS = {
    "client": os.path.join("..", "client", "src"),
    "shared": os.path.join("..", "shared"),
}

PALETTE = (
    "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|"
    "violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone"
)

RULES = [
    {
        "name": "raw Tailwind palette classes",
        "pattern": rf"\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|shadow)-(?:{PALETTE})-\d+",
        "exclude": (),
        "hint": "use a semantic token (bg-success-soft, text-muted-foreground, …)",
    },
    {
        "name": "hardcoded white/black",
        "pattern": r"\b(?:bg|text|border|from|to|via)-(?:white|black)(?:/\d+)?\b",
        "exclude": (),
        "hint": "use --card / --foreground / --primary-foreground, or --scrim for overlays",
    },
    {
        "name": "recharts series slots used as a palette",
        "pattern": r"\bchart-[1-5]\b",
        "exclude": ("components/ui/chart.tsx",),
        "hint": "chart-* belongs to recharts; use the cat-* ramp for taxonomy",
    },
    {
        "name": "viewport-height units",
        "pattern": r"\b(?:min-h|h)-screen\b",
        "exclude": (),
        "hint": "use dvh so the layout does not jump as browser chrome hides",
    },
    {
        "name": "off-system overlay scrim",
        "pattern": r"bg-black/\d+",
        "exclude": (),
        "hint": "overlays use bg-[var(--scrim)]",
    },
]


def walk():
    for label, root in ROOTS.items():
        for base, _dirs, files in os.walk(root):
            for name in files:
                if not name.endswith((".ts", ".tsx")):
                    continue
                if name.endswith((".test.ts", ".test.tsx")):
                    continue
                path = os.path.join(base, name)
                rel = os.path.relpath(path, os.path.join("..")).replace("\\", "/")
                yield rel, path


def main() -> int:
    failures = 0
    for rule in RULES:
        regex = re.compile(rule["pattern"])
        hits = []
        for rel, path in walk():
            if any(x in rel for x in rule["exclude"]):
                continue
            for i, line in enumerate(open(path, encoding="utf-8"), 1):
                if regex.search(line):
                    hits.append(f"{rel}:{i}: {line.strip()[:100]}")
        if hits:
            failures += len(hits)
            print(f"\nFAIL  {rule['name']}  ({len(hits)})")
            print(f"      {rule['hint']}")
            for h in hits[:12]:
                print(f"      {h}")
            if len(hits) > 12:
                print(f"      … and {len(hits) - 12} more")
        else:
            print(f"ok    {rule['name']}")

    print()
    if failures:
        print(f"{failures} drift(s) found")
        return 1
    print("no drift: the UI is on the design system")
    return 0


if __name__ == "__main__":
    sys.exit(main())
