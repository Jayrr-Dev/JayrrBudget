from pathlib import Path

p = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
text = p.read_text(encoding="utf-8")
old = '''      className="flex h-auto w-full max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto bg-transparent pb-0.5"
    >
      {series.map((item, index) => (
        <ToggleGroupItem
          key={item.key}
          value={item.key}
          size="sm"
          aria-label={`Toggle ${item.label}`}
          className="h-6 shrink-0 rounded-md border border-[var(--border)] bg-transparent px-2 py-0 text-xs font-normal shadow-none hover:bg-[var(--muted)] data-[state=off]:opacity-40 data-[state=on]:bg-transparent"
        >'''
new = '''      className="flex h-auto w-full max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto bg-transparent"
    >
      {series.map((item, index) => (
        <ToggleGroupItem
          key={item.key}
          value={item.key}
          size="sm"
          aria-label={`Toggle ${item.label}`}
          className="h-5 min-h-0 shrink-0 rounded-md border border-[var(--border)] bg-transparent px-2 py-0 text-xs font-normal leading-none shadow-none hover:bg-[var(--muted)] data-[state=off]:opacity-40 data-[state=on]:bg-transparent"
        >'''
if old not in text:
    raise SystemExit("OLD NOT FOUND")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("OK")
