"""Contrast-check every design token pair. Exit 1 on any failure.

    cd design-system && python verify_tokens.py [-v]

Kept separate from tokens.py because tokens.py is exec'd by generate_css.py,
where a __main__ guard would fire and abort the caller.
"""
import sys

exec(open("tokens.py").read())

sys.exit(1 if verify("-v" in sys.argv) else 0)
