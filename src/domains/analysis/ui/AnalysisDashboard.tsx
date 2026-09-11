"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { IconInfoCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMoney } from "@/domains/dashboard/domain/money";
import {
  ANALYSIS_PERIOD_META,
  ANALYSIS_PERIOD_OPTIONS,
} from "@/domains/analysis/domain/periods";
import type {
  AnalysisCategoryBreakdown,
  AnalysisCategorySeries,
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
  AnalysisRankedItem,
  AnalysisStackedRankedBreakdown,
  AnalysisSubcategoryBreakdown,
  AnalysisTagBreakdown,
  AnalysisMerchantBreakdown,
} from "@/domains/analysis/domain/types";
import { fetchAnalysis } from "@/domains/analysis/queries/fetchAnalysis";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/shared/lib/format-date";

const RANGE_OPTIONS: { value: AnalysisRange; label: string }[] = [
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

type AnalysisTab =
  | "main"
  | "summary"
  | "sections"
  | "categories"
  | "subcategories"
  | "tags"
  | "merchants"
  | "patterns";

const TAB_OPTIONS: { value: AnalysisTab; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "summary", label: "Summary" },
  { value: "sections", label: "Sections" },
  { value: "categories", label: "Categories" },
  { value: "subcategories", label: "Subcategories" },
  { value: "tags", label: "Tags" },
  { value: "merchants", label: "Merchants" },
  { value: "patterns", label: "Patterns" },
];

const TREND_CONFIG = {
  spend: {
    label: "Spending",
    color: "oklch(0.55 0.12 35)",
  },
  income: {
    label: "Income",
    color: "oklch(0.52 0.1 155)",
  },
  transfers: {
    label: "Internal transfers",
    color: "oklch(0.62 0.02 250)",
  },
} satisfies ChartConfig;

const TREND_SERIES: AnalysisCategorySeries[] = [
  { key: "spend", label: "Spending" },
  { key: "income", label: "Income" },
  { key: "transfers", label: "Transfers" },
];

const TREND_LEGEND_COLORS = [
  TREND_CONFIG.spend.color,
  TREND_CONFIG.income.color,
  TREND_CONFIG.transfers.color,
];

const CATEGORY_COLORS = [
  "oklch(0.55 0.12 35)",
  "oklch(0.5 0.1 220)",
  "oklch(0.52 0.1 155)",
  "oklch(0.58 0.11 85)",
  "oklch(0.48 0.09 300)",
  "oklch(0.45 0.08 20)",
  "oklch(0.42 0.04 250)",
];

type BreakdownView = "bar" | "pie";

const BREAKDOWN_VIEW_OPTIONS: { value: BreakdownView; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "pie", label: "Pie" },
];

function useAnalysis(range: AnalysisRange, period: AnalysisPeriod) {
  return useQuery({
    queryKey: analysisQueryKeys.range(range, period),
    queryFn: () => fetchAnalysis(range, period),
    placeholderData: keepPreviousData,
  });
}

function moneyTick(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label={label}
        >
          <IconInfoCircle className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs text-left leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function Stat({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      <div className="flex items-center gap-1">
        <p className="text-xs tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          {label}
        </p>
        {info ? <InfoTip label={`${label} info`}>{info}</InfoTip> : null}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ChartTitle({
  title,
  info,
  actions,
}: {
  title: string;
  info: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-center gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <InfoTip label={`${title} info`}>{info}</InfoTip>
      </div>
      {actions}
    </div>
  );
}

type MixScale = "standard" | "relative";

const MIX_SCALE_OPTIONS: { value: MixScale; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "relative", label: "Relative" },
];

function PeriodViews({
  value,
  onChange,
}: {
  value: AnalysisPeriod;
  onChange: (value: AnalysisPeriod) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="Time series view"
      options={ANALYSIS_PERIOD_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}

function ScaleViews({
  value,
  onChange,
}: {
  value: MixScale;
  onChange: (value: MixScale) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="Chart scale"
      options={MIX_SCALE_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}

function ChartActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {children}
    </div>
  );
}

function toRelativeRows(
  rows: Array<Record<string, string | number>>,
  keys: string[],
) {
  return rows.map((row) => {
    const total = keys.reduce(
      (sum, key) => sum + Math.max(0, Number(row[key] ?? 0)),
      0,
    );
    const next: Record<string, string | number> = {
      month: row.month,
      label: row.label,
    };
    for (const key of keys) {
      const value = Math.max(0, Number(row[key] ?? 0));
      next[key] = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
    }
    return next;
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPiePercent(percent: number) {
  const share = percent * 100;
  if (share >= 10) return `${Math.round(share)}%`;
  return `${share.toFixed(1)}%`;
}

const PIE_LABEL_RADIAN = Math.PI / 180;
const PIE_LABEL_INK = "#171717";

function PieDonutLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
  name = "",
  index = 0,
}: PieLabelRenderProps) {
  const share = Number(percent);
  if (!Number.isFinite(share) || share < 0.015) return null;

  const rad = -Number(midAngle) * PIE_LABEL_RADIAN;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sliceName = String(name);
  const label = formatPiePercent(share);
  const inside = share >= 0.08;
  const showName = sliceName.length > 0 && (inside ? share >= 0.12 : share >= 0.04);

  if (inside) {
    const x = Number(cx) + ((Number(innerRadius) + Number(outerRadius)) / 2) * cos;
    const y = Number(cy) + ((Number(innerRadius) + Number(outerRadius)) / 2) * sin;
    if (!showName) {
      return (
        <text
          x={x}
          y={y}
          fill={PIE_LABEL_INK}
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          className="text-[12px] font-semibold"
        >
          {label}
        </text>
      );
    }
    return (
      <g pointerEvents="none">
        <text
          x={x}
          y={y - 7}
          fill={PIE_LABEL_INK}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[12px] font-semibold"
        >
          {label}
        </text>
        <text
          x={x}
          y={y + 8}
          fill={PIE_LABEL_INK}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[10px]"
        >
          {sliceName}
        </text>
      </g>
    );
  }

  const startX = Number(cx) + (Number(outerRadius) + 4) * cos;
  const startY = Number(cy) + (Number(outerRadius) + 4) * sin;
  const elbow = 14 + (Number(index) % 3) * 8;
  const midX = Number(cx) + (Number(outerRadius) + elbow) * cos;
  const midY = Number(cy) + (Number(outerRadius) + elbow) * sin;
  const side = cos >= 0 ? 1 : -1;
  const endX = midX + side * 12;
  const endY = midY;
  const textX = endX + side * 6;
  const anchor = cos >= 0 ? "start" : "end";

  return (
    <g pointerEvents="none">
      <path
        d={`M${startX},${startY}L${midX},${midY}L${endX},${endY}`}
        fill="none"
        stroke={PIE_LABEL_INK}
        strokeWidth={1}
      />
      <text
        x={textX}
        y={showName ? endY - 6 : endY}
        fill={PIE_LABEL_INK}
        textAnchor={anchor}
        dominantBaseline="central"
        className="text-[11px] font-semibold"
      >
        {label}
      </text>
      {showName ? (
        <text
          x={textX}
          y={endY + 8}
          fill={PIE_LABEL_INK}
          textAnchor={anchor}
          dominantBaseline="central"
          className="text-[10px]"
        >
          {sliceName}
        </text>
      ) : null}
    </g>
  );
}

function activeVisibleKeys(allKeys: string[], current: string[]) {
  const active = current.filter((item) => allKeys.includes(item));
  return active.length > 0 ? active : allKeys;
}

function nextVisibleKeys(allKeys: string[], current: string[], key: string) {
  const selected = activeVisibleKeys(allKeys, current);
  if (selected.length === allKeys.length) return [key];
  if (selected.includes(key)) {
    const next = selected.filter((item) => item !== key);
    return next.length > 0 ? next : allKeys;
  }
  return allKeys.filter((item) => selected.includes(item) || item === key);
}

function nextVisibleKeySet(allKeys: string[], current: string[], next: string[]) {
  if (next.length === 0) return allKeys;
  const selected = activeVisibleKeys(allKeys, current);
  if (selected.length === allKeys.length && next.length === allKeys.length - 1) {
    const isolated = allKeys.find((key) => !next.includes(key));
    return isolated ? [isolated] : next;
  }
  return next;
}

function TimeSeriesTable({
  rows,
  columns,
  currency,
  visibleKeys,
  onVisibleKeysChange,
  valueKind = "money",
}: {
  rows: Array<Record<string, string | number>>;
  columns: { key: string; label: string }[];
  currency: string;
  visibleKeys?: string[];
  onVisibleKeysChange?: (keys: string[]) => void;
  valueKind?: "money" | "percent";
}) {
  const columnSeries = useMemo(
    () => columns.map((column) => ({ key: column.key, label: column.label })),
    [columns],
  );
  const internal = useVisibleSeries(columnSeries);
  const allKeys = columns.map((column) => column.key);
  const keys = visibleKeys ?? internal.visibleKeys;
  const setKeys = onVisibleKeysChange ?? internal.setVisibleKeys;
  const filterable = columns.length > 1;

  if (rows.length === 0) return null;
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-[var(--border)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            {columns.map((column) => {
              const on = !filterable || keys.includes(column.key);
              return (
                <TableHead key={column.key} className="text-right">
                  {filterable ? (
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Toggle ${column.label}`}
                      onClick={() =>
                        setKeys(nextVisibleKeys(allKeys, keys, column.key))
                      }
                      className={cn(
                        "rounded-sm font-medium hover:bg-muted",
                        !on && "opacity-40 line-through",
                      )}
                    >
                      {column.label}
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={String(row.month ?? row.label)}>
              <TableCell className="whitespace-nowrap font-medium">
                {String(row.label ?? "")}
              </TableCell>
              {columns.map((column) => {
                const on = !filterable || keys.includes(column.key);
                return (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "text-right font-mono tabular-nums",
                      !on && "opacity-40",
                    )}
                  >
                    {valueKind === "percent"
                      ? formatPercent(Number(row[column.key] ?? 0))
                      : formatMoney(Number(row[column.key] ?? 0), currency)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
      <p className="text-lg font-medium">No transactions in this range</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Import statements, then spending trends show up here.
      </p>
    </div>
  );
}

function TrendChart({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const { visibleKeys, setVisibleKeys } = useVisibleSeries(TREND_SERIES);
  const visibleKeySet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const [scale, setScale] = useState<MixScale>("standard");
  const isRelative = scale === "relative";
  const chartRows = useMemo(
    () =>
      isRelative ? toRelativeRows(data.monthly, visibleKeys) : data.monthly,
    [data.monthly, isRelative, visibleKeys],
  );

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle
        title="Spending vs income"
        info="Lifestyle outflows and real income. Card payoffs count once, on the paying account. Visa 'payment thank you' credits are the other side of the same move. Relative stacks visible series to 100% for each period."
        actions={
          <ChartActions>
            <ScaleViews value={scale} onChange={setScale} />
            <PeriodViews value={period} onChange={onPeriodChange} />
          </ChartActions>
        }
      />
      <ChartContainer
        config={TREND_CONFIG}
        className="aspect-[2/1] w-full"
        initialDimension={{ width: 640, height: 280 }}
      >
        <AreaChart
          data={chartRows}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            domain={isRelative ? [0, 100] : ["auto", "auto"]}
            tickFormatter={(value) =>
              isRelative
                ? formatPercent(Number(value))
                : moneyTick(Number(value), data.currency)
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel={false}
                formatter={(value, name, item) => {
                  if (Number(value) === 0) return null;
                  const label =
                    TREND_CONFIG[name as keyof typeof TREND_CONFIG]?.label ??
                    String(name);
                  const month = (item?.payload as { month?: string } | undefined)
                    ?.month;
                  const source = data.monthly.find((row) => row.month === month);
                  const money = source
                    ? Number(source[name as keyof typeof source] ?? 0)
                    : Number(value);
                  return (
                    <div className="flex flex-1 justify-between gap-4">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-medium tabular-nums">
                        {isRelative
                          ? `${formatPercent(Number(value))} (${formatMoney(money, data.currency)})`
                          : formatMoney(Number(value), data.currency)}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          {visibleKeySet.has("spend") ? (
            <Area
              type="monotone"
              dataKey="spend"
              stackId={isRelative ? "trend" : undefined}
              stroke="var(--color-spend)"
              fill="var(--color-spend)"
              fillOpacity={isRelative ? 0.92 : 0.18}
              strokeWidth={2}
              name="spend"
            />
          ) : null}
          {visibleKeySet.has("income") ? (
            <Area
              type="monotone"
              dataKey="income"
              stackId={isRelative ? "trend" : undefined}
              stroke="var(--color-income)"
              fill="var(--color-income)"
              fillOpacity={isRelative ? 0.92 : 0.12}
              strokeWidth={2}
              name="income"
            />
          ) : null}
          {visibleKeySet.has("transfers") ? (
            <Area
              type="monotone"
              dataKey="transfers"
              stackId={isRelative ? "trend" : undefined}
              stroke="var(--color-transfers)"
              fill="var(--color-transfers)"
              fillOpacity={isRelative ? 0.92 : 0.08}
              strokeWidth={1.5}
              strokeDasharray={isRelative ? undefined : "4 4"}
              name="transfers"
            />
          ) : null}
        </AreaChart>
      </ChartContainer>
      <SeriesLegend
        series={TREND_SERIES}
        value={visibleKeys}
        onValueChange={setVisibleKeys}
        colors={TREND_LEGEND_COLORS}
      />
      <TimeSeriesTable
        rows={chartRows}
        columns={TREND_SERIES.map((item) => ({
          key: item.key,
          label: item.label,
        }))}
        currency={data.currency}
        visibleKeys={visibleKeys}
        onVisibleKeysChange={setVisibleKeys}
        valueKind={isRelative ? "percent" : "money"}
      />
    </section>
  );
}

function MixTooltip({
  active,
  payload,
  label,
  config,
  currency,
  otherItems,
  nestedItems,
  scale = "standard",
  sourceRow,
  shareOf,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string | number; name?: string }>;
  label?: string;
  config: ChartConfig;
  currency: string;
  otherItems?: AnalysisRankedItem[];
  nestedItems?: Record<string, AnalysisRankedItem[]>;
  scale?: MixScale;
  sourceRow?: Record<string, string | number>;
  shareOf?: number;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => Number(item.value) > 0);
  if (rows.length === 0) return null;
  const isRelative = scale === "relative";
  const showShare = isRelative || shareOf != null;
  const moneyTotal = sourceRow
    ? rows.reduce((sum, item) => {
        const key = String(item.dataKey ?? item.name ?? "");
        return sum + Math.max(0, Number(sourceRow[key] ?? 0));
      }, 0)
    : rows.reduce((sum, item) => sum + Number(item.value), 0);
  const leftovers = otherItems ?? [];
  const formatLine = (money: number, relativeValue?: number) => {
    if (isRelative && relativeValue != null) {
      return `${formatPercent(relativeValue)} (${formatMoney(money, currency)})`;
    }
    if (showShare && moneyTotal > 0) {
      return `${formatPercent((money / moneyTotal) * 100)} (${formatMoney(money, currency)})`;
    }
    return formatMoney(money, currency);
  };
  return (
    <div className="grid min-w-40 max-w-72 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">
        {String(label ?? "")}
        {shareOf != null ? ` · ${formatPercent(shareOf)}` : ""}
      </div>
      {rows.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "");
        const name = config[key]?.label ?? key;
        const extras =
          key === "other" && leftovers.length > 0
            ? leftovers
            : (nestedItems?.[key] ?? []);
        const money = sourceRow
          ? Number(sourceRow[key] ?? 0)
          : Number(item.value);
        return (
          <div key={key} className="grid gap-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{name}</span>
              <span className="font-mono font-medium tabular-nums">
                {formatLine(money, Number(item.value))}
              </span>
            </div>
            {extras.length > 0 ? (
              <div className="max-h-40 overflow-auto">
                {extras.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex justify-between gap-4 pl-2 text-muted-foreground"
                  >
                    <span className="truncate">{entry.name}</span>
                    <span className="font-mono tabular-nums">
                      {showShare && moneyTotal > 0
                        ? `${formatPercent((entry.spend / moneyTotal) * 100)} (${formatMoney(entry.spend, currency)})`
                        : formatMoney(entry.spend, currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="flex justify-between gap-4 border-t border-border/50 pt-1.5 font-medium">
        <span>Total</span>
        <span className="font-mono tabular-nums">
          {showShare
            ? `100.0% (${formatMoney(moneyTotal, currency)})`
            : formatMoney(moneyTotal, currency)}
        </span>
      </div>
    </div>
  );
}

function useVisibleSeries(series: AnalysisCategorySeries[]) {
  const seriesKey = series.map((item) => item.key).join("\0");
  const allKeys = useMemo(
    () => series.map((item) => item.key),
    [seriesKey],
  );
  const [selected, setSelected] = useState<string[]>(allKeys);
  const selectedKeySet = useMemo(() => new Set(selected), [selected]);
  const visibleKeys = useMemo(() => {
    const next = allKeys.filter((key) => selectedKeySet.has(key));
    return next.length > 0 ? next : allKeys;
  }, [allKeys, selectedKeySet]);
  const visibleKeySet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleSeries = useMemo(
    () => series.filter((item) => visibleKeySet.has(item.key)),
    [series, visibleKeySet],
  );

  return {
    visibleKeys,
    visibleSeries,
    setVisibleKeys: (keys: string[]) => {
      setSelected(keys.length > 0 ? keys : allKeys);
    },
  };
}

function SeriesLegend({
  series,
  value,
  onValueChange,
  colors = CATEGORY_COLORS,
}: {
  series: AnalysisCategorySeries[];
  value: string[];
  onValueChange: (keys: string[]) => void;
  colors?: string[];
}) {
  if (series.length === 0) return null;
  return (
    <ToggleGroup
      type="multiple"
      value={value}
      onValueChange={(next) =>
        onValueChange(
          nextVisibleKeySet(
            series.map((item) => item.key),
            value,
            next,
          ),
        )
      }
      spacing={1}
      aria-label="Filter series"
      className="flex h-auto w-full max-w-full flex-wrap items-center justify-center bg-transparent"
    >
      {series.map((item, index) => (
        <ToggleGroupItem
          key={item.key}
          value={item.key}
          size="sm"
          aria-label={`Toggle ${item.label}`}
          className="h-auto max-w-[10rem] whitespace-normal bg-transparent px-1.5 py-0.5 text-xs font-normal shadow-none hover:bg-[var(--muted)] data-[state=off]:opacity-40 data-[state=on]:bg-transparent"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{
              backgroundColor: colors[index % colors.length],
            }}
          />
          <span className="leading-snug break-words text-[var(--foreground)]">
            {item.label}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function AreaCallout({
  x,
  y,
  label,
  side,
  lift,
}: {
  x: number;
  y: number;
  label: string;
  side: 1 | -1;
  lift: number;
}) {
  const anchorX = x;
  const anchorY = y + 7;
  const labelX = x + side * 32;
  const labelY = y - 10 - lift;
  const textAnchor = side === 1 ? "start" : "end";

  return (
    <g style={{ pointerEvents: "none" }}>
      <line
        x1={anchorX}
        y1={anchorY}
        x2={labelX}
        y2={labelY + 2}
        stroke="#111"
        strokeWidth={1}
      />
      <circle cx={anchorX} cy={anchorY} r={2.25} fill="#111" />
      <text
        x={labelX + side * 5}
        y={labelY}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill="#111"
        className="text-[11px] font-medium"
      >
        {label}
      </text>
    </g>
  );
}

function OtherBreakdownTable({
  items,
  currency,
}: {
  items?: AnalysisRankedItem[];
  currency: string;
}) {
  const series = useMemo(
    () => (items ?? []).map((item) => ({ key: item.name, label: item.name })),
    [items],
  );
  const { visibleKeys, setVisibleKeys } = useVisibleSeries(series);
  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleItems = (items ?? []).filter((item) => visibleSet.has(item.name));
  const total = visibleItems.reduce((sum, item) => sum + item.spend, 0);
  const allKeys = series.map((item) => item.key);

  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Other ({visibleItems.length})</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Last 15% of spend, rolled into Other. Click a name to hide it. Share is of this pile.
        </p>
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const on = visibleSet.has(item.name);
              return (
                <TableRow key={item.name} className={cn(!on && "opacity-40")}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Toggle ${item.name}`}
                      onClick={() =>
                        setVisibleKeys(
                          nextVisibleKeys(allKeys, visibleKeys, item.name),
                        )
                      }
                      className={cn(
                        "text-left font-medium hover:bg-muted",
                        !on && "line-through",
                      )}
                    >
                      {item.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(item.spend, currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                    {on ? formatShare(item.spend, total) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Other total</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoney(total, currency)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                100.0%
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

function StackedMixChart({
  title,
  info,
  series,
  monthly,
  currency,
  period,
  onPeriodChange,
  variant = "bar",
  other,
  otherByPeriod,
  nestedByPeriod,
}: {
  title: string;
  info: string;
  series: AnalysisCategorySeries[];
  monthly: Array<Record<string, string | number>>;
  currency: string;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  variant?: "bar" | "area";
  other?: AnalysisRankedItem[];
  otherByPeriod?: Record<string, AnalysisRankedItem[]>;
  nestedByPeriod?: Record<string, Record<string, AnalysisRankedItem[]>>;
}) {
  const { visibleKeys, visibleSeries, setVisibleKeys } = useVisibleSeries(series);
  const [scale, setScale] = useState<MixScale>("standard");
  const isArea = variant === "area";
  const isRelative = isArea && scale === "relative";
  const chartRows = useMemo(
    () => (isRelative ? toRelativeRows(monthly, visibleKeys) : monthly),
    [isRelative, monthly, visibleKeys],
  );
  const config = useMemo(() => {
    const next: ChartConfig = {};
    series.forEach((item, index) => {
      next[item.key] = {
        label: item.label,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
    });
    return next;
  }, [series]);
  const peakIndexByKey = useMemo(() => {
    const peaks = new Map<string, number>();
    for (const item of visibleSeries) {
      let peakIndex = 0;
      let peakValue = -1;
      chartRows.forEach((row, index) => {
        const value = Number(row[item.key] ?? 0);
        if (value > peakValue) {
          peakValue = value;
          peakIndex = index;
        }
      });
      peaks.set(item.key, peakIndex);
    }
    return peaks;
  }, [chartRows, visibleSeries]);
  const lastKey = visibleSeries[visibleSeries.length - 1]?.key ?? "";

  if (series.length === 0) return null;

  const mixTooltip = (
    <ChartTooltip
      content={(props) => {
        const row = props.payload?.[0]?.payload as
          | { month?: string }
          | undefined;
        const month = row?.month;
        const periodItems =
          month && otherByPeriod?.[month]?.length
            ? otherByPeriod[month]
            : other;
        const sourceRow = month
          ? monthly.find((item) => String(item.month) === String(month))
          : undefined;
        return (
          <MixTooltip
            active={props.active}
            payload={(props.payload ?? []).map((item) => ({
              value: Number(item.value),
              dataKey:
                typeof item.dataKey === "string" ||
                typeof item.dataKey === "number"
                  ? item.dataKey
                  : undefined,
              name: item.name == null ? undefined : String(item.name),
            }))}
            label={props.label == null ? undefined : String(props.label)}
            config={config}
            currency={currency}
            otherItems={periodItems}
            nestedItems={month ? nestedByPeriod?.[month] : undefined}
            scale={isRelative ? "relative" : "standard"}
            sourceRow={sourceRow}
          />
        );
      }}
    />
  );

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle
        title={title}
        info={info}
        actions={
          <ChartActions>
            {isArea ? <ScaleViews value={scale} onChange={setScale} /> : null}
            <PeriodViews value={period} onChange={onPeriodChange} />
          </ChartActions>
        }
      />
      <ChartContainer
        config={config}
        className={isArea ? "aspect-[5/2] w-full" : "aspect-[2/1] w-full"}
        initialDimension={{ width: 640, height: isArea ? 320 : 280 }}
      >
        {isArea ? (
          <AreaChart
            data={chartRows}
            margin={{ left: 8, right: 28, top: 28, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              domain={isRelative ? [0, 100] : ["auto", "auto"]}
              tickFormatter={(value) =>
                isRelative
                  ? formatPercent(Number(value))
                  : moneyTick(Number(value), currency)
              }
            />
            {mixTooltip}
            {visibleSeries.map((item) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stackId="spend"
                stroke={`var(--color-${item.key})`}
                fill={`var(--color-${item.key})`}
                fillOpacity={0.92}
                strokeWidth={1}
                name={item.label}
              >
                <LabelList
                  dataKey={item.key}
                  content={(props) => {
                    const peakIndex = peakIndexByKey.get(item.key) ?? -1;
                    if (props.index !== peakIndex) return null;
                    const row = chartRows[peakIndex];
                    const value = Number(row?.[item.key] ?? 0);
                    const total = visibleSeries.reduce(
                      (sum, entry) => sum + Number(row?.[entry.key] ?? 0),
                      0,
                    );
                    if (value <= 0 || total <= 0 || value / total < 0.05) {
                      return null;
                    }
                    const x = Number(props.x ?? 0);
                    const y = Number(props.y ?? 0);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                    const itemIndex = visibleSeries.findIndex(
                      (entry) => entry.key === item.key,
                    );
                    return (
                      <AreaCallout
                        x={x}
                        y={y}
                        label={item.label}
                        side={itemIndex % 2 === 0 ? 1 : -1}
                        lift={(itemIndex % 3) * 12}
                      />
                    );
                  }}
                />
              </Area>
            ))}
          </AreaChart>
        ) : (
          <BarChart
            data={monthly}
            margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value) => moneyTick(Number(value), currency)}
            />
            {mixTooltip}
            {visibleSeries.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId="spend"
                fill={`var(--color-${item.key})`}
                radius={item.key === lastKey ? [3, 3, 0, 0] : 0}
                name={item.label}
              />
            ))}
          </BarChart>
        )}
      </ChartContainer>
      <SeriesLegend
        series={series}
        value={visibleKeys}
        onValueChange={setVisibleKeys}
      />
      <TimeSeriesTable
        rows={chartRows}
        columns={series.map((item) => ({
          key: item.key,
          label: item.label,
        }))}
        currency={currency}
        visibleKeys={visibleKeys}
        onVisibleKeysChange={setVisibleKeys}
        valueKind={isRelative ? "percent" : "money"}
      />
      <OtherBreakdownTable items={other} currency={currency} />
    </section>
  );
}

function stackedRowTooltip(
  props: {
    active?: boolean;
    payload?: Array<{
      value?: unknown;
      dataKey?: string | number;
      name?: unknown;
      payload?: unknown;
    }>;
    label?: unknown;
  },
  config: ChartConfig,
  currency: string,
  otherByRow?: Record<string, AnalysisRankedItem[]>,
  series?: AnalysisCategorySeries[],
  pieTotal?: number,
) {
  const raw = props.payload?.[0]?.payload;
  const row =
    raw && typeof raw === "object"
      ? (raw as Record<string, string | number>)
      : undefined;
  const rowName = String(row?.name ?? props.label ?? "");
  const payload =
    series && row
      ? series.map((item) => ({
          value: Number(row[item.key] ?? 0),
          dataKey: item.key,
          name: item.label,
        }))
        : (props.payload ?? []).map((item) => ({
          value: Number(item.value),
          dataKey:
            typeof item.dataKey === "string" || typeof item.dataKey === "number"
              ? item.dataKey
              : undefined,
          name: item.name == null ? undefined : String(item.name),
        }));
  const sliceSpend = Number(row?.spend ?? 0);
  const shareOf =
    pieTotal && pieTotal > 0 && sliceSpend > 0
      ? (sliceSpend / pieTotal) * 100
      : undefined;
  return (
    <MixTooltip
      active={props.active}
      payload={payload}
      label={rowName}
      config={config}
      currency={currency}
      otherItems={otherByRow?.[rowName]}
      shareOf={shareOf}
    />
  );
}

function StackedRankedBarChart({
  title,
  info,
  rows,
  series,
  currency,
  labelWidth = 160,
  onSelect,
  otherByRow,
  showViewToggle = false,
}: {
  title: string;
  info: string;
  rows: Array<Record<string, string | number>>;
  series: AnalysisCategorySeries[];
  currency: string;
  labelWidth?: number;
  onSelect?: (name: string) => void;
  otherByRow?: Record<string, AnalysisRankedItem[]>;
  showViewToggle?: boolean;
}) {
  const { visibleKeys, visibleSeries, setVisibleKeys } = useVisibleSeries(series);
  const [view, setView] = useState<BreakdownView>("bar");
  const config = useMemo(() => {
    const next: ChartConfig = {};
    series.forEach((item, index) => {
      next[item.key] = {
        label: item.label,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
    });
    return next;
  }, [series]);
  const lastKey = visibleSeries[visibleSeries.length - 1]?.key ?? "";
  const isPie = showViewToggle && view === "pie";
  const pieRows = useMemo(
    () =>
      rows
        .map((row) => ({
          ...row,
          spend: visibleSeries.reduce(
            (sum, item) => sum + Number(row[item.key] ?? 0),
            0,
          ),
        }))
        .filter((row) => row.spend > 0),
    [rows, visibleSeries],
  );
  const pieTotal = pieRows.reduce((sum, row) => sum + Number(row.spend), 0);

  if (rows.length === 0 || series.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle
        title={title}
        info={info}
        actions={
          showViewToggle ? (
            <SegmentedControl
              ariaLabel="Breakdown chart type"
              options={BREAKDOWN_VIEW_OPTIONS}
              value={view}
              onChange={setView}
            />
          ) : undefined
        }
      />
      {isPie ? (
        <ChartContainer
          config={config}
          className="mx-auto aspect-square w-full max-w-2xl"
          initialDimension={{ width: 640, height: 640 }}
        >
          <PieChart accessibilityLayer margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <ChartTooltip
              content={(props) =>
                stackedRowTooltip(
                  props,
                  config,
                  currency,
                  otherByRow,
                  visibleSeries,
                  pieTotal,
                )
              }
            />
            <Pie
              data={pieRows}
              dataKey="spend"
              nameKey="name"
              innerRadius="46%"
              outerRadius="78%"
              paddingAngle={1.5}
              stroke="var(--background)"
              strokeWidth={2}
              style={onSelect ? { cursor: "pointer" } : undefined}
              onClick={(data) => {
                const name =
                  data && typeof data === "object" && "name" in data
                    ? String((data as { name?: string }).name ?? "")
                    : "";
                if (onSelect && name) onSelect(name);
              }}
              label={PieDonutLabel}
              labelLine={false}
            >
              {pieRows.map((row, index) => (
                <Cell
                  key={String(row.name)}
                  fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{
            ["--rows" as string]: rows.length,
            height: `calc(2.4rem * ${Math.max(rows.length, 1)} + 4rem)`,
          }}
          initialDimension={{ width: 640, height: Math.max(420, rows.length * 38) }}
        >
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
            accessibilityLayer
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={labelWidth}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => moneyTick(Number(value), currency)}
            />
            <ChartTooltip
              content={(props) =>
                stackedRowTooltip(props, config, currency, otherByRow)
              }
            />
            {visibleSeries.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId="stack"
                fill={`var(--color-${item.key})`}
                radius={item.key === lastKey ? [0, 4, 4, 0] : 0}
                name={item.label}
                onClick={(data) => {
                  const row = data as { payload?: { name?: string } };
                  const name = row.payload?.name;
                  if (onSelect && typeof name === "string") onSelect(name);
                }}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
      <SeriesLegend
        series={series}
        value={visibleKeys}
        onValueChange={setVisibleKeys}
      />
    </section>
  );
}

function formatShare(spend: number, total: number) {
  if (total <= 0) return "—";
  return `${((spend / total) * 100).toFixed(1)}%`;
}

function stackedBreakdownText(
  rowName: string,
  stacked: AnalysisStackedRankedBreakdown | undefined,
  currency: string,
) {
  if (!stacked) return null;
  const row = stacked.rows.find((item) => item.name === rowName);
  if (!row) return null;

  const leftovers = stacked.otherByRow?.[rowName] ?? [];
  const leftoverSet = new Set(leftovers.map((item) => item.name));
  const named = stacked.series
    .filter((series) => series.key !== "other")
    .map((series) => ({
      label: series.label,
      spend: Number(row[series.key] ?? 0),
    }))
    .filter((item) => item.spend > 0 && !leftoverSet.has(item.label))
    .sort((a, b) => b.spend - a.spend)
    .map((item) => `${item.label} (${formatMoney(item.spend, currency)})`);
  const leftoverParts = leftovers.map(
    (item) => `${item.name} (${formatMoney(item.spend, currency)})`,
  );
  if (leftovers.length === 0) {
    const otherSeries = stacked.series.find((series) => series.key === "other");
    const otherSpend = otherSeries ? Number(row[otherSeries.key] ?? 0) : 0;
    if (otherSpend > 0) {
      leftoverParts.push(`Other (${formatMoney(otherSpend, currency)})`);
    }
  }
  const parts = [...named, ...leftoverParts];

  return parts.length > 0 ? parts.join(" · ") : null;
}

function TaxonomyBreakdownTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  totalSpend,
  nestedLabel,
  stacked,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  totalSpend: number;
  nestedLabel?: string;
  stacked?: AnalysisStackedRankedBreakdown;
}) {
  const series = useMemo(
    () => rows.map((row) => ({ key: row.name, label: row.name })),
    [rows],
  );
  const { visibleKeys, setVisibleKeys } = useVisibleSeries(series);
  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleRows = rows.filter((row) => visibleSet.has(row.name));
  const tableTotal = visibleRows.reduce((sum, row) => sum + row.spend, 0);
  const allKeys = series.map((item) => item.key);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle title={title} info={info} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{nameLabel}</TableHead>
            {nestedLabel ? <TableHead>{nestedLabel}</TableHead> : null}
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const on = visibleSet.has(row.name);
            const nested = stackedBreakdownText(row.name, stacked, currency);
            return (
              <TableRow key={row.name} className={cn(!on && "opacity-40")}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Toggle ${row.name}`}
                    onClick={() =>
                      setVisibleKeys(
                        nextVisibleKeys(allKeys, visibleKeys, row.name),
                      )
                    }
                    className={cn(
                      "text-left font-medium hover:bg-muted",
                      !on && "line-through",
                    )}
                  >
                    {row.name}
                  </button>
                </TableCell>
                {nestedLabel ? (
                  <TableCell className="max-w-md whitespace-normal text-[var(--muted-foreground)]">
                    {nested ?? "—"}
                  </TableCell>
                ) : null}
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(row.spend, currency)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {on ? formatShare(row.spend, totalSpend) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={nestedLabel ? 2 : 1}>Total</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatMoney(tableTotal, currency)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatShare(tableTotal, totalSpend)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

function RankedBarChart({
  title,
  info,
  rows,
  currency,
  color = "oklch(0.5 0.1 220)",
  labelWidth = 120,
  onSelect,
}: {
  title: string;
  info: string;
  rows: AnalysisRankedItem[];
  currency: string;
  color?: string;
  labelWidth?: number;
  onSelect?: (name: string) => void;
}) {
  const config = {
    spend: { label: "Spend", color },
  } satisfies ChartConfig;

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle title={title} info={info} />
      <ChartContainer
        config={config}
        className="aspect-auto h-[min(28rem,calc(2.2rem*var(--rows)+3rem))] w-full"
        style={{ ["--rows" as string]: rows.length }}
        initialDimension={{ width: 640, height: 360 }}
      >
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
          accessibilityLayer
          style={onSelect ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid horizontal={false} />
          <YAxis
            dataKey="name"
            type="category"
            width={labelWidth}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => moneyTick(Number(value), currency)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => formatMoney(Number(value), currency)}
              />
            }
          />
          <Bar
            dataKey="spend"
            fill="var(--color-spend)"
            radius={[0, 4, 4, 0]}
            name="spend"
            onClick={(data) => {
              const row = data as { name?: string; payload?: { name?: string } };
              const name = row.payload?.name ?? row.name;
              if (onSelect && typeof name === "string") onSelect(name);
            }}
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

function WeekdayChart({ data }: { data: AnalysisData }) {
  const config = {
    spend: { label: "Spend", color: "oklch(0.52 0.1 155)" },
  } satisfies ChartConfig;

  if (data.weekdays.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle
        title="Spend by weekday"
        info="Posted date from Transaction Dates. Lifestyle spend only."
      />
      <ChartContainer
        config={config}
        className="aspect-[2/1] w-full"
        initialDimension={{ width: 640, height: 240 }}
      >
        <BarChart
          data={data.weekdays}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => String(value).slice(0, 3)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value) => moneyTick(Number(value), data.currency)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatMoney(Number(value), data.currency)}
              />
            }
          />
          <Bar
            dataKey="spend"
            fill="var(--color-spend)"
            radius={[4, 4, 0, 0]}
            name="spend"
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

function NetLineChart({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const points = data.monthly.map((point) => ({
    ...point,
    net: Math.round((point.income - point.spend) * 100) / 100,
  }));
  const config = {
    net: { label: "Net", color: "oklch(0.45 0.06 250)" },
  } satisfies ChartConfig;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle
        title="Net cash flow"
        info="Income minus lifestyle spend. Internal transfers excluded so paying a credit card does not look like extra income or extra spend."
        actions={<PeriodViews value={period} onChange={onPeriodChange} />}
      />
      <ChartContainer
        config={config}
        className="aspect-[2.4/1] w-full"
        initialDimension={{ width: 640, height: 240 }}
      >
        <LineChart
          data={points}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value) => moneyTick(Number(value), data.currency)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatMoney(Number(value), data.currency)}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--color-net)"
            strokeWidth={2}
            dot={false}
            name="net"
          />
        </LineChart>
      </ChartContainer>
      <TimeSeriesTable
        rows={points}
        columns={[{ key: "net", label: "Net" }]}
        currency={data.currency}
      />
    </section>
  );
}

function CategoryDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (category: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisCategoryBreakdown | undefined =
    data.breakdowns.find((item) => item.category === selected) ??
    data.breakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Category detail"
        info="Pick a category. Subcategories come from transaction labels. Merchants come from enrichment and entities."
      />
      <div className="flex flex-wrap gap-1">
        {data.breakdowns.map((item) => (
          <Button
            key={item.category}
            type="button"
            size="sm"
            variant={item.category === breakdown.category ? "default" : "outline"}
            onClick={() => onSelect(item.category)}
          >
            {item.category}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.category} subcategory mix`}
        info={`How ${breakdown.category} splits by subcategory over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.typeSeries}
        monthly={breakdown.typeMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title={`${breakdown.category} subcategories`}
          info="Finer labels under this category (Food Delivery, Gym Memberships, AI Code Editors & IDEs)."
          rows={breakdown.types}
          currency={data.currency}
          color="oklch(0.52 0.1 155)"
        />
        <RankedBarChart
          title={`${breakdown.category} merchants`}
          info="Who took the money inside this category."
          rows={breakdown.merchants}
          currency={data.currency}
          color="oklch(0.55 0.12 35)"
          labelWidth={140}
        />
      </div>
    </section>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] p-1"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          className={cn(value === option.value && "pointer-events-none")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function LeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  totalSpend,
  onSelect,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  totalSpend: number;
  onSelect?: (name: string) => void;
}) {
  const top = rows.slice(0, 10);
  const topTotal = top.reduce((sum, row) => sum + row.spend, 0);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle title={title} info={info} />
      {top.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nothing in this range.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{nameLabel}</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((row, index) => (
              <TableRow key={row.name}>
                <TableCell className="text-[var(--muted-foreground)] tabular-nums">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(row.name)}
                      className="text-left font-medium hover:underline"
                    >
                      {row.name}
                    </button>
                  ) : (
                    row.name
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(row.spend, currency)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {formatShare(row.spend, totalSpend)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Top {top.length}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatMoney(topTotal, currency)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatShare(topTotal, totalSpend)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </section>
  );
}

function SummaryTab({
  data,
  onSelectSection,
  onSelectCategory,
  onSelectSubcategory,
  onSelectTag,
  onSelectMerchant,
}: {
  data: AnalysisData;
  onSelectSection: (name: string) => void;
  onSelectCategory: (name: string) => void;
  onSelectSubcategory: (name: string) => void;
  onSelectTag: (name: string) => void;
  onSelectMerchant: (name: string) => void;
}) {
  const total = data.summary.totalSpend;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <LeaderboardTable
        title="Top sections"
        info="Biggest taxonomy sections by lifestyle spend. Click a name to open Sections."
        nameLabel="Section"
        rows={data.sections}
        currency={data.currency}
        totalSpend={total}
        onSelect={onSelectSection}
      />
      <LeaderboardTable
        title="Top categories"
        info="Biggest categories by lifestyle spend. Click a name to open that category."
        nameLabel="Category"
        rows={data.categories}
        currency={data.currency}
        totalSpend={total}
        onSelect={onSelectCategory}
      />
      <LeaderboardTable
        title="Top subcategories"
        info="Biggest subcategories by lifestyle spend. Click a name to open that subcategory."
        nameLabel="Subcategory"
        rows={data.subcategories}
        currency={data.currency}
        totalSpend={total}
        onSelect={onSelectSubcategory}
      />
      <LeaderboardTable
        title="Top tags"
        info="Biggest tags by lifestyle spend. A transaction can carry more than one tag. Click a name to open that tag."
        nameLabel="Tag"
        rows={data.tags}
        currency={data.currency}
        totalSpend={total}
        onSelect={onSelectTag}
      />
      <LeaderboardTable
        title="Top merchants"
        info="Biggest Merchant clean names by lifestyle spend. Click a name to open that merchant."
        nameLabel="Merchant"
        rows={data.merchants}
        currency={data.currency}
        totalSpend={total}
        onSelect={onSelectMerchant}
      />
    </div>
  );
}

function MainTab({
  data,
  period,
  onPeriodChange,
  onSelectCategory,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  onSelectCategory: (name: string) => void;
}) {
  const periodMeta = ANALYSIS_PERIOD_META[period];
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Lifestyle spending"
          value={formatMoney(data.summary.totalSpend, data.currency)}
          info={`${data.summary.spendCount} purchase rows, net of ${formatMoney(data.summary.refunds, data.currency)} refunds.`}
        />
        <Stat
          label="Income"
          value={formatMoney(data.summary.totalIncome, data.currency)}
          info="Payroll, cashback, and e-transfers in. Card payment credits on the visa are not income."
        />
        <Stat
          label={periodMeta.avgLabel}
          value={formatMoney(data.summary.avgPeriodSpend, data.currency)}
          info={`Lifestyle spend divided by ${periodMeta.nounPlural} that had spend.`}
        />
        <Stat
          label={periodMeta.peakLabel}
          value={
            data.summary.peakSpendPeriod
              ? formatMoney(data.summary.peakSpendAmount, data.currency)
              : "—"
          }
          info={
            data.summary.peakSpendPeriod
              ? `Highest lifestyle spend: ${data.summary.peakSpendPeriod}.`
              : "No spend in this range."
          }
        />
        <Stat
          label="Internal transfers"
          value={formatMoney(data.summary.internalTransfers, data.currency)}
          info={`${data.summary.transferCount} paying-side moves. ${formatMoney(data.summary.inboundTransfersIgnored, data.currency)} in matching credits on cards/LOC left out so the same payoff is not counted twice.`}
        />
      </section>

      <TrendChart
        data={data}
        period={period}
        onPeriodChange={onPeriodChange}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title="Top spending categories"
          info="Net spend after refunds. Card payoffs stay out. Remittances and e-transfers to people stay in. Click a bar to open that category on the Categories tab."
          rows={data.categories.slice(0, 10)}
          currency={data.currency}
          onSelect={onSelectCategory}
        />
        <NetLineChart
          data={data}
          period={period}
          onPeriodChange={onPeriodChange}
        />
      </div>
    </div>
  );
}

function SectionsTab({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  return (
    <div className="space-y-6">
      <StackedRankedBarChart
        title="Section breakdown"
        info="Each section bar splits by its biggest categories. The last 15% of that section rolls into Other. Hover Other to see the names."
        rows={data.sectionStacked.rows}
        series={data.sectionStacked.series}
        currency={data.currency}
        labelWidth={120}
        otherByRow={data.sectionStacked.otherByRow}
        showViewToggle
      />
      <StackedMixChart
        title="Section mix over time"
        info={`${ANALYSIS_PERIOD_META[period].label} lifestyle spend by taxonomy section. Named bands are the first 85%. The last 15% is Other.`}
        series={data.sectionSeries}
        monthly={data.sectionMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        variant="area"
        other={data.sectionOther}
        otherByPeriod={data.sectionOtherByPeriod}
      />
      <TaxonomyBreakdownTable
        title="All sections"
        info="Every section in this range with spend, share of lifestyle outflow, and top categories inside each section."
        nameLabel="Section"
        rows={data.sections}
        currency={data.currency}
        totalSpend={data.summary.totalSpend}
        nestedLabel="Top categories"
        stacked={data.sectionStacked}
      />
    </div>
  );
}

function CategoriesTab({
  data,
  category,
  onSelectCategory,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  category: string;
  onSelectCategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  return (
    <div className="space-y-6">
      <StackedRankedBarChart
        title="Category breakdown"
        info="Each category bar splits by its biggest subcategories. The last 15% of that category rolls into Other. Hover Other to see the names."
        rows={data.categoryStacked.rows}
        series={data.categoryStacked.series}
        currency={data.currency}
        labelWidth={160}
        onSelect={onSelectCategory}
        otherByRow={data.categoryStacked.otherByRow}
        showViewToggle
      />
      <StackedMixChart
        title="Category mix over time"
        info={`Stacked ${ANALYSIS_PERIOD_META[period].label.toLowerCase()} lifestyle spend. Named bands are the first 85%. The last 15% is Other.`}
        series={data.categorySeries}
        monthly={data.categoryMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        variant="area"
        other={data.categoryOther}
        otherByPeriod={data.categoryOtherByPeriod}
      />
      <CategoryDrilldown
        data={data}
        selected={category}
        onSelect={onSelectCategory}
        period={period}
        onPeriodChange={onPeriodChange}
      />
      <TaxonomyBreakdownTable
        title="All categories"
        info="Every category in this range with spend, share of lifestyle outflow, and top subcategories inside each category."
        nameLabel="Category"
        rows={data.categories}
        currency={data.currency}
        totalSpend={data.summary.totalSpend}
        nestedLabel="Top subcategories"
        stacked={data.categoryStacked}
      />
    </div>
  );
}

function SubcategoryDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (subcategory: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisSubcategoryBreakdown | undefined =
    data.subcategoryBreakdowns.find((item) => item.subcategory === selected) ??
    data.subcategoryBreakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Subcategory detail"
        info="Pick a subcategory. Merchants come from Merchant clean on each transaction."
      />
      <div className="flex flex-wrap gap-1">
        {data.subcategoryBreakdowns.map((item) => (
          <Button
            key={item.subcategory}
            type="button"
            size="sm"
            variant={
              item.subcategory === breakdown.subcategory ? "default" : "outline"
            }
            onClick={() => onSelect(item.subcategory)}
          >
            {item.subcategory}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.subcategory} merchant mix`}
        info={`How ${breakdown.subcategory} splits by Merchant clean over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.merchantSeries}
        monthly={breakdown.merchantMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.subcategory} merchants`}
        info="Merchant clean names inside this subcategory."
        rows={breakdown.merchants}
        currency={data.currency}
        color="oklch(0.55 0.12 35)"
        labelWidth={160}
      />
    </section>
  );
}

function SubcategoriesTab({
  data,
  subcategory,
  onSelectSubcategory,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  subcategory: string;
  onSelectSubcategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const stacked = data.subcategoryStacked ?? { rows: [], series: [] };
  const breakdowns = data.subcategoryBreakdowns ?? [];

  return (
    <div className="space-y-6">
      <StackedRankedBarChart
        title="Subcategory breakdown"
        info="Every subcategory with spend, sliced by Merchant clean. The last 15% inside each row rolls into Other. Click a bar to open its merchant detail."
        rows={stacked.rows}
        series={stacked.series}
        currency={data.currency}
        labelWidth={180}
        onSelect={(name) => {
          if (breakdowns.some((item) => item.subcategory === name)) {
            onSelectSubcategory(name);
          }
        }}
        otherByRow={stacked.otherByRow}
        showViewToggle
      />
      <StackedMixChart
        title="Subcategory mix over time"
        info={`${ANALYSIS_PERIOD_META[period].label} spend by subcategory. Named bands are the first 85%. The last 15% is Other.`}
        series={data.subcategorySeries}
        monthly={data.subcategoryMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        variant="area"
        other={data.subcategoryOther}
        otherByPeriod={data.subcategoryOtherByPeriod}
      />
      <SubcategoryDrilldown
        data={data}
        selected={subcategory}
        onSelect={onSelectSubcategory}
        period={period}
        onPeriodChange={onPeriodChange}
      />
      <TaxonomyBreakdownTable
        title="All subcategories"
        info="Every subcategory label in this range with spend, share of lifestyle outflow, and top Merchant clean names inside each subcategory."
        nameLabel="Subcategory"
        rows={data.subcategories}
        currency={data.currency}
        totalSpend={data.summary.totalSpend}
        nestedLabel="Top merchants"
        stacked={stacked}
      />
    </div>
  );
}

function TagDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (tag: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisTagBreakdown | undefined =
    data.tagBreakdowns.find((item) => item.tag === selected) ??
    data.tagBreakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Tag detail"
        info="Pick a tag. Merchants come from Merchant clean on each tagged transaction."
      />
      <div className="flex flex-wrap gap-1">
        {data.tagBreakdowns.map((item) => (
          <Button
            key={item.tag}
            type="button"
            size="sm"
            variant={item.tag === breakdown.tag ? "default" : "outline"}
            onClick={() => onSelect(item.tag)}
          >
            {item.tag}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.tag} merchant mix`}
        info={`How ${breakdown.tag} splits by Merchant clean over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.merchantSeries}
        monthly={breakdown.merchantMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.tag} merchants`}
        info="Merchant clean names inside this tag."
        rows={breakdown.merchants}
        currency={data.currency}
        color="oklch(0.55 0.12 35)"
        labelWidth={160}
      />
    </section>
  );
}

function TagsTab({
  data,
  tag,
  onSelectTag,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  tag: string;
  onSelectTag: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const stacked = data.tagStacked ?? { rows: [], series: [] };
  const breakdowns = data.tagBreakdowns ?? [];
  const tags = data.tags ?? [];

  if (tags.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
        <p className="text-lg font-medium">No tags in this range</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Tags on transactions show up here the same way subcategories do.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StackedRankedBarChart
        title="Tag breakdown"
        info="Every tag with spend, sliced by category. The last 15% inside each row rolls into Other. A transaction can carry more than one tag, so rows can overlap. Click a bar to open its merchant detail."
        rows={stacked.rows}
        series={stacked.series}
        currency={data.currency}
        labelWidth={160}
        onSelect={(name) => {
          if (breakdowns.some((item) => item.tag === name)) {
            onSelectTag(name);
          }
        }}
        otherByRow={stacked.otherByRow}
        showViewToggle
      />
      <StackedMixChart
        title="Tag mix over time"
        info={`${ANALYSIS_PERIOD_META[period].label} spend by tag. Named bands are the first 85%. The last 15% is Other. Hover a period to see categories inside each tag.`}
        series={data.tagSeries}
        monthly={data.tagMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        variant="area"
        other={data.tagOther}
        otherByPeriod={data.tagOtherByPeriod}
        nestedByPeriod={data.tagCategoryByPeriod}
      />
      <TagDrilldown
        data={data}
        selected={tag}
        onSelect={onSelectTag}
        period={period}
        onPeriodChange={onPeriodChange}
      />
      <TaxonomyBreakdownTable
        title="All tags"
        info="Every tag in this range with spend, share of lifestyle outflow, and top categories. Shares can add up past 100% because one row can have several tags."
        nameLabel="Tag"
        rows={tags}
        currency={data.currency}
        totalSpend={data.summary.totalSpend}
        nestedLabel="Top categories"
        stacked={stacked}
      />
    </div>
  );
}

function MerchantDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (merchant: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisMerchantBreakdown | undefined =
    data.merchantBreakdowns.find((item) => item.merchant === selected) ??
    data.merchantBreakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Merchant detail"
        info="Pick a Merchant clean name. Subcategories come from transaction labels."
      />
      <div className="flex flex-wrap gap-1">
        {data.merchantBreakdowns.map((item) => (
          <Button
            key={item.merchant}
            type="button"
            size="sm"
            variant={
              item.merchant === breakdown.merchant ? "default" : "outline"
            }
            onClick={() => onSelect(item.merchant)}
          >
            {item.merchant}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.merchant} subcategory mix`}
        info={`How ${breakdown.merchant} splits by subcategory over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.typeSeries}
        monthly={breakdown.typeMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.merchant} subcategories`}
        info="Subcategory labels inside this Merchant clean name."
        rows={breakdown.types}
        currency={data.currency}
        color="oklch(0.52 0.1 155)"
        labelWidth={160}
      />
    </section>
  );
}

function MerchantsTab({
  data,
  merchant,
  onSelectMerchant,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  merchant: string;
  onSelectMerchant: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const stacked = data.merchantStacked ?? { rows: [], series: [] };
  const breakdowns = data.merchantBreakdowns ?? [];
  const merchants = data.merchants ?? [];

  if (merchants.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
        <p className="text-lg font-medium">No merchants in this range</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Merchant clean names show up here the same way subcategories do.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StackedRankedBarChart
        title="Merchant breakdown"
        info="Every Merchant clean name with spend, sliced by subcategory. The last 15% inside each row rolls into Other. Click a bar to open its subcategory detail."
        rows={stacked.rows}
        series={stacked.series}
        currency={data.currency}
        labelWidth={180}
        onSelect={(name) => {
          if (breakdowns.some((item) => item.merchant === name)) {
            onSelectMerchant(name);
          }
        }}
        otherByRow={stacked.otherByRow}
        showViewToggle
      />
      <StackedMixChart
        title="Merchant mix over time"
        info={`${ANALYSIS_PERIOD_META[period].label} spend by Merchant clean. Named bands are the first 85%. The last 15% is Other.`}
        series={data.merchantSeries ?? []}
        monthly={data.merchantMonthly ?? []}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        variant="area"
        other={data.merchantOther}
        otherByPeriod={data.merchantOtherByPeriod}
      />
      <MerchantDrilldown
        data={data}
        selected={merchant}
        onSelect={onSelectMerchant}
        period={period}
        onPeriodChange={onPeriodChange}
      />
      <TaxonomyBreakdownTable
        title="All merchants"
        info="Every Merchant clean name in this range with spend, share of lifestyle outflow, and top subcategories inside each merchant."
        nameLabel="Merchant clean"
        rows={merchants}
        currency={data.currency}
        totalSpend={data.summary.totalSpend}
        nestedLabel="Top subcategories"
        stacked={stacked}
      />
      <RankedBarChart
        title="Places"
        info="From Transaction Locations. City when present, else region. Online-only rows with no city are skipped."
        rows={data.places}
        currency={data.currency}
        color="oklch(0.48 0.09 300)"
      />
    </div>
  );
}

function PatternsTab({ data }: { data: AnalysisData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title="How you pay"
          info="From Transaction Payment Refs channel, falling back to enrichment channel."
          rows={data.channels}
          currency={data.currency}
          color="oklch(0.45 0.08 20)"
        />
        <RankedBarChart
          title="By account"
          info="Lifestyle spend on each linked account. Card purchases sit on the card; chequing shows PAD, e-transfer, and cash."
          rows={data.accounts}
          currency={data.currency}
          color="oklch(0.5 0.1 220)"
          labelWidth={150}
        />
      </div>
      <WeekdayChart data={data} />
    </div>
  );
}

export function AnalysisDashboard() {
  const [range, setRange] = useState<AnalysisRange>("12m");
  const [period, setPeriod] = useState<AnalysisPeriod>("monthly");
  const [tab, setTab] = useState<AnalysisTab>("main");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [tag, setTag] = useState("");
  const [merchant, setMerchant] = useState("");
  const query = useAnalysis(range, period);
  const data = query.data;

  useEffect(() => {
    const names = data?.breakdowns.map((item) => item.category) ?? [];
    if (names.length === 0) return;
    if (!names.includes(category)) setCategory(names[0] ?? "");
  }, [data, category]);

  useEffect(() => {
    const names =
      data?.subcategoryBreakdowns.map((item) => item.subcategory) ?? [];
    if (names.length === 0) return;
    if (!names.includes(subcategory)) setSubcategory(names[0] ?? "");
  }, [data, subcategory]);

  useEffect(() => {
    const names = data?.tagBreakdowns.map((item) => item.tag) ?? [];
    if (names.length === 0) return;
    if (!names.includes(tag)) setTag(names[0] ?? "");
  }, [data, tag]);

  useEffect(() => {
    const names = data?.merchantBreakdowns.map((item) => item.merchant) ?? [];
    if (names.length === 0) return;
    if (!names.includes(merchant)) setMerchant(names[0] ?? "");
  }, [data, merchant]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8">
        <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
              Finance
            </p>
            <div className="flex items-center gap-1">
              <h1 className="text-3xl font-semibold tracking-tight">Analysis</h1>
              <InfoTip label="Analysis info">
                {data
                  ? `Range ${formatDisplayDate(data.earliestDate)} – ${formatDisplayDate(data.latestDate)}. Spend is purchases plus remittances, net of refunds. Paying a card from chequing counts once as an internal transfer.`
                  : "Spending over time after internal transfers are pulled out."}
              </InfoTip>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <SegmentedControl
              ariaLabel="Time range"
              options={RANGE_OPTIONS}
              value={range}
              onChange={setRange}
            />
            <PeriodViews value={period} onChange={setPeriod} />
          </div>
        </header>

        <SegmentedControl
          ariaLabel="Analysis view"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />

        {query.isError ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {query.error.message}
          </div>
        ) : null}

        {query.isPending && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--muted)]/40"
              />
            ))}
          </div>
        ) : null}

        {data && data.transactionCount === 0 ? <EmptyState /> : null}

        {data && data.transactionCount > 0 ? (
          <>
            {tab === "main" ? (
              <MainTab
                data={data}
                period={period}
                onPeriodChange={setPeriod}
                onSelectCategory={(name) => {
                  if (data.breakdowns.some((item) => item.category === name)) {
                    setCategory(name);
                    setTab("categories");
                  }
                }}
              />
            ) : null}
            {tab === "summary" ? (
              <SummaryTab
                data={data}
                onSelectSection={() => setTab("sections")}
                onSelectCategory={(name) => {
                  if (data.breakdowns.some((item) => item.category === name)) {
                    setCategory(name);
                  }
                  setTab("categories");
                }}
                onSelectSubcategory={(name) => {
                  if (
                    data.subcategoryBreakdowns.some(
                      (item) => item.subcategory === name,
                    )
                  ) {
                    setSubcategory(name);
                  }
                  setTab("subcategories");
                }}
                onSelectTag={(name) => {
                  if (data.tagBreakdowns.some((item) => item.tag === name)) {
                    setTag(name);
                  }
                  setTab("tags");
                }}
                onSelectMerchant={(name) => {
                  if (
                    data.merchantBreakdowns.some((item) => item.merchant === name)
                  ) {
                    setMerchant(name);
                  }
                  setTab("merchants");
                }}
              />
            ) : null}
            {tab === "sections" ? (
              <SectionsTab
                data={data}
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : null}
            {tab === "categories" ? (
              <CategoriesTab
                data={data}
                category={category}
                onSelectCategory={setCategory}
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : null}
            {tab === "subcategories" ? (
              <SubcategoriesTab
                data={data}
                subcategory={subcategory}
                onSelectSubcategory={setSubcategory}
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : null}
            {tab === "tags" ? (
              <TagsTab
                data={data}
                tag={tag}
                onSelectTag={setTag}
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : null}
            {tab === "merchants" ? (
              <MerchantsTab
                data={data}
                merchant={merchant}
                onSelectMerchant={setMerchant}
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : null}
            {tab === "patterns" ? <PatternsTab data={data} /> : null}
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
