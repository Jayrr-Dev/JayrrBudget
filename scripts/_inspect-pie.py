from pathlib import Path

t = Path("src/domains/analysis/ui/AnalysisDashboard.tsx").read_text(encoding="utf-8")
i = t.find('from "recharts"')
print("import idx", i)
print(repr(t[i - 400 : i + 30]))
print("---")
j = t.find("label={PieDonutLabel}")
print("pie idx", j)
print(repr(t[j : j + 450]))
print("---")
print("has Label import", "\n    Label,\n" in t or "\n  Label,\n" in t)
print("has PieCenterTotal", "function PieCenterTotal" in t)
