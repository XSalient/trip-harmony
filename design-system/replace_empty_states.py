"""One-shot: swap the hand-rolled dashed empty cards for the shared EmptyState.

Six screens carried the same shape — a `Card border-dashed` wrapping a 40px
muted icon and one line of text. They drift (icon size, padding, whether there
is an action), and none of them offered a way out of the empty state. This
normalises the markup; copy is carried over verbatim.

Run from design-system/:  python replace_empty_states.py [--dry-run]
"""
import glob
import os
import re
import sys

DRY = "--dry-run" in sys.argv
PAGES = os.path.join("..", "client", "src", "pages", "*.tsx")

PATTERN = re.compile(
    r'<Card className="border-dashed">\s*'
    r'<CardContent className="p-8 text-center">\s*'
    r'<(?P<icon>\w+) className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />\s*'
    r'<p className="text-sm text-muted-foreground">\s*(?P<body>.*?)\s*</p>\s*'
    r'</CardContent>\s*</Card>',
    re.S,
)


def to_title(body: str) -> str:
    """The body may be a literal or a JSX expression; keep whichever it is."""
    body = body.strip()
    if body.startswith("{"):
        return body
    return '"' + body.replace('"', "'").replace("\n", " ").strip() + '"'


def main() -> int:
    total = 0
    for path in glob.glob(PAGES):
        original = open(path, encoding="utf-8").read()
        text, n = PATTERN.subn(
            lambda m: f"<EmptyState icon={{{m.group('icon')}}} title={to_title(m.group('body'))} />",
            original,
        )
        if not n:
            continue
        total += n
        if "@/components/harmony" not in text:
            text = text.replace(
                'import AppShell from "@/components/AppShell";',
                'import AppShell from "@/components/AppShell";\n'
                'import { EmptyState } from "@/components/harmony";',
                1,
            )
        elif "EmptyState" not in text.split("from \"@/components/harmony\"")[0][-300:]:
            text = re.sub(
                r'import \{([^}]*)\} from "@/components/harmony";',
                lambda m: 'import {' + m.group(1).rstrip() + ',\n  EmptyState,\n} from "@/components/harmony";',
                text,
                count=1,
            )
        print(f"  {n}  {os.path.basename(path)}")
        if not DRY:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
    print(("would replace " if DRY else "replaced ") + f"{total} empty states")
    return total


if __name__ == "__main__":
    main()
