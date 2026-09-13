from pathlib import Path
import re

p = Path("src/components/layout/PersistentNoteFab.tsx")
t = p.read_text(encoding="utf-8")

m = re.search(
    r'\n          <div className="flex items-center justify-between gap-2 border-b border-\[var\(--border\)\] px-3 py-1\.5">.*?</div>\n\n',
    t,
    re.S,
)
if not m:
    raise SystemExit("header block not found")

t2 = t[: m.start()] + "\n" + t[m.end() :]
t2 = re.sub(
    r"\n  const receiveName =\n    tabs\.find\(\(tab\) => tab\.id === receiveId\)\?\.name \?\? \"Note\";\n",
    "\n",
    t2,
)
p.write_text(t2, encoding="utf-8")
print("removed header")
print("still has hint", "+ adds go to" in t2 or "Temporary" in t2)
print("receiveName left", "receiveName" in t2)
