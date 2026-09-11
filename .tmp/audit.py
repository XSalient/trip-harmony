import re, pathlib, collections
root = pathlib.Path("client/src")
files = [p for p in root.rglob("*.tsx") if "components/ui/" not in p.as_posix()]
rules = {
  "uppercase section label": re.compile(r'uppercase[^"]*tracking-wider|tracking-wider[^"]*uppercase'),
  "native checkbox/radio":   re.compile(r'<input\s+type="(checkbox|radio)"'),
  "tiny type (<12px)":       re.compile(r'text-\[(?:9|10|11)px\]'),
  "sub-44 input height":     re.compile(r'<(?:Input|Textarea|SelectTrigger)[^>]*\bh-(?:7|8|9)\b'),
  "hand-rolled icon button": re.compile(r'<button[^>]*className="[^"]*\bp-(?:0\.5|1|1\.5)\b[^"]*"'),
  "native select":           re.compile(r'<select[\s>]'),
  "raw rounded (off-scale)": re.compile(r'\brounded-(?:sm|DEFAULT)\b|className="[^"]*\brounded\b(?!-)'),
}
tot = collections.Counter()
per = collections.defaultdict(collections.Counter)
for f in files:
    t = f.read_text(encoding="utf-8", errors="ignore")
    for name, rx in rules.items():
        n = len(rx.findall(t))
        if n:
            tot[name] += n
            per[f.as_posix().replace("client/src/","")][name] = n
print("== totals ==")
for k,v in tot.most_common(): print(f"{v:4d}  {k}")
print("\n== by file ==")
for f, c in sorted(per.items(), key=lambda kv: -sum(kv[1].values())):
    print(f"{sum(c.values()):4d}  {f}   " + ", ".join(f"{k}:{v}" for k,v in c.most_common()))
