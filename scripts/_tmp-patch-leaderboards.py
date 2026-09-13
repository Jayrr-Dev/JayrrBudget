from pathlib import Path

path = Path(r"c:\Users\Main\Documents\Projects\JayrrBudget\src\domains\analysis\ui\AnalysisDashboard.tsx")
text = path.read_text(encoding="utf-8")
start = text.index("/** High / mid / low spend across header range period buckets. */")
end = text.index("function MainTab({")
new = Path(r"c:\Users\Main\Documents\Projects\JayrrBudget\scripts\_tmp-leaderboards.tsx").read_text(encoding="utf-8")
path.write_text(text[:start] + new + text[end:], encoding="utf-8")
print("ok", len(new))
