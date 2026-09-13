from pathlib import Path

path = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
text = path.read_text(encoding="utf-8")

old_import = """import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from \"recharts\";"""

new_import = """import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from \"recharts\";"""

if old_import not in text:
    raise SystemExit("IMPORT BLOCK NOT FOUND")
text = text.replace(old_import, new_import, 1)

helper = """function PieCenterTotal({
  viewBox,
  total,
  currency,
}: {
  viewBox?: { cx?: number; cy?: number };
  total: number;
  currency: string;
}) {
  const cx = viewBox?.cx;
  const cy = viewBox?.cy;
  if (cx == null || cy == null) return null;

  return (
    <text textAnchor=\"middle\" dominantBaseline=\"central\">
      <tspan
        x={cx}
        y={cy - 12}
        fill=\"var(--muted-foreground)\"
        fontSize={12}
      >
        Total
      </tspan>
      <tspan
        x={cx}
        y={cy + 10}
        fill=\"var(--foreground)\"
        fontSize={16}
        fontWeight={600}
      >
        {formatMoney(total, currency)}
      </tspan>
    </text>
  );
}

"""

marker = "function PieDonutLabel({"
if "function PieCenterTotal(" not in text:
    if marker not in text:
        raise SystemExit("PieDonutLabel NOT FOUND")
    text = text.replace(marker, helper + marker, 1)

old_pie = """              label={PieDonutLabel}
              labelLine={false}
            >
              {pieRows.map((row, index) => (
                <Cell
                  key={String(row.name)}
                  fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                />
              ))}
            </Pie>"""

new_pie = """              label={PieDonutLabel}
              labelLine={false}
            >
              <Label
                position=\"center\"
                content={({ viewBox }) => (
                  <PieCenterTotal
                    viewBox={viewBox as { cx?: number; cy?: number }}
                    total={pieTotal}
                    currency={currency}
                  />
                )}
              />
              {pieRows.map((row, index) => (
                <Cell
                  key={String(row.name)}
                  fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                />
              ))}
            </Pie>"""

if old_pie not in text:
    raise SystemExit("PIE BLOCK NOT FOUND")
text = text.replace(old_pie, new_pie, 1)

path.write_text(text, encoding="utf-8")
print("OK")
