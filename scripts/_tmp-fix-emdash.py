from pathlib import Path
import re

path = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
text = path.read_text(encoding="utf-8")

pattern = r'footerAvgCount == null \? "([^"]*)" : formatAvgCount\(footerAvgCount\)'
match = re.search(pattern, text)
if not match:
    raise SystemExit("pattern not found")
print("before:", repr(match.group(0)))
text = re.sub(
    pattern,
    'footerAvgCount == null ? "\u2014" : formatAvgCount(footerAvgCount)',
    text,
    count=1,
)
path.write_text(text, encoding="utf-8")
match2 = re.search(pattern, path.read_text(encoding="utf-8"))
print("after:", repr(match2.group(0) if match2 else None))
