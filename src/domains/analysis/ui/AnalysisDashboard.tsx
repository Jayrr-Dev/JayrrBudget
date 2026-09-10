"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { IconInfoCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type {
  AnalysisCategoryBreakdown,
  AnalysisCategorySeries,
  AnalysisData,
  AnalysisRange,
  AnalysisRankedItem,
} from "@/domains/analysis/domain/types";
import { fetchAnalysis } from "@/domains/analysis/queries/fetchAnalysis";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/shared/lib/format-date";

const RANGE_OPTIONS: { value: AnalysisRange; label: string }[] = [
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
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

const CATEGORY_COLORS = [
  "oklch(0.55 0.12 35)",
  "oklch(0.5 0.1 220)",
  "oklch(0.52 0.1 155)",
  "oklch(0.58 0.11 85)",
  "oklch(0.48 0.09 300)",
  "oklch(0.45 0.08 20)",
  "oklch(0.42 0.04 250)",
];

function useAnalysis(range: AnalysisRange) {
  return useQuery({
    queryKey: analysisQueryKeys.range(range),
    queryFn: () => fetchAnalysis(range),
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

function ChartTitle({ title, info }: { title: string; info: string }) {
  return (
    <div className="flex items-center gap-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <InfoTip label={`${title} info`}>{info}</InfoTip>
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

function TrendChart({ data }: { data: AnalysisData }) {
  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle
        title="Spending vs income"
        info="Lifestyle outflows and real income. Card payoffs count once, on the paying account. Visa 'payment thank you' credits are the other side of the same move."
      />
      <ChartContainer
        config={TREND_CONFIG}
        className="aspect-[2/1] w-full"
        initialDimension={{ width: 640, height: 280 }}
      >
        <AreaChart
          data={data.monthly}
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
                hideLabel={false}
                formatter={(value, name) => {
                  if (Number(value) === 0) return null;
                  const label =
                    TREND_CONFIG[name as keyof typeof TREND_CONFIG]?.label ??
                    String(name);
                  return (
                    <div className="flex flex-1 justify-between gap-4">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatMoney(Number(value), data.currency)}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            type="monotone"
            dataKey="spend"
            stroke="var(--color-spend)"
            fill="var(--color-spend)"
            fillOpacity={0.18}
            strokeWidth={2}
            name="spend"
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke="var(--color-income)"
            fill="var(--color-income)"
            fillOpacity={0.12}
            strokeWidth={2}
            name="income"
          />
          <Area
            type="monotone"
            dataKey="transfers"
            stroke="var(--color-transfers)"
            fill="var(--color-transfers)"
            fillOpacity={0.08}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            name="transfers"
          />
        </AreaChart>
      </ChartContainer>
    </section>
  );
}

function MixTooltip({
  active,
  payload,
  label,
  config,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string | number; name?: string }>;
  label?: string;
  config: ChartConfig;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => Number(item.value) > 0);
  if (rows.length === 0) return null;
  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{String(label ?? "")}</div>
      {rows.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "");
        const name = config[key]?.label ?? key;
        return (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{name}</span>
            <span className="font-mono font-medium tabular-nums">
              {formatMoney(Number(item.value), currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StackedMixChart({
  title,
  info,
  series,
  monthly,
  currency,
}: {
  title: string;
  info: string;
  series: AnalysisCategorySeries[];
  monthly: Array<Record<string, string | number>>;
  currency: string;
}) {
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

  if (series.length === 0) return null;
  const lastKey = series[series.length - 1]?.key ?? "";

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle title={title} info={info} />
      <ChartContainer
        config={config}
        className="aspect-[2/1] w-full"
        initialDimension={{ width: 640, height: 280 }}
      >
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
          <ChartTooltip
            content={(props) => (
              <MixTooltip
                {...props}
                config={config}
                currency={currency}
              />
            )}
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((item) => (
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
      </ChartContainer>
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
          onClick={(state) => {
            const name = state?.activePayload?.[0]?.payload?.name;
            if (onSelect && typeof name === "string") onSelect(name);
          }}
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

function NetLineChart({ data }: { data: AnalysisData }) {
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
    </section>
  );
}

function CategoryDrilldown({
  data,
  selected,
  onSelect,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (category: string) => void;
}) {
  const breakdown: AnalysisCategoryBreakdown | undefined =
    data.breakdowns.find((item) => item.category === selected) ??
    data.breakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Category detail"
        info="Pick a category. Types come from Transaction Labels. Merchants come from Enrichment and Entities."
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
        title={`${breakdown.category} mix`}
        info={`How ${breakdown.category} splits by type over months. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.typeSeries}
        monthly={breakdown.typeMonthly}
        currency={data.currency}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title={`${breakdown.category} types`}
          info="Finer labels under this category (Restaurants, Groceries, SaaS, Loan Payment)."
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

export function AnalysisDashboard() {
  const [range, setRange] = useState<AnalysisRange>("12m");
  const [category, setCategory] = useState("");
  const query = useAnalysis(range);
  const data = query.data;

  useEffect(() => {
    const names = data?.breakdowns.map((item) => item.category) ?? [];
    if (names.length === 0) return;
    if (!names.includes(category)) setCategory(names[0] ?? "");
  }, [data, category]);

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
        <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] p-1">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={range === option.value ? "default" : "ghost"}
              className={cn(range === option.value && "pointer-events-none")}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </header>

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
              label="Avg monthly spend"
              value={formatMoney(data.summary.avgMonthlySpend, data.currency)}
              info="Lifestyle spend divided by months that had spend."
            />
            <Stat
              label="Peak month"
              value={
                data.summary.peakSpendMonth
                  ? formatMoney(data.summary.peakSpendAmount, data.currency)
                  : "—"
              }
              info={
                data.summary.peakSpendMonth
                  ? `Highest lifestyle spend: ${data.summary.peakSpendMonth}.`
                  : "No spend in this range."
              }
            />
            <Stat
              label="Internal transfers"
              value={formatMoney(
                data.summary.internalTransfers,
                data.currency,
              )}
              info={`${data.summary.transferCount} paying-side moves. ${formatMoney(data.summary.inboundTransfersIgnored, data.currency)} in matching credits on cards/LOC left out so the same payoff is not counted twice.`}
            />
          </section>

          <TrendChart data={data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <RankedBarChart
              title="Top spending categories"
              info="Net spend after refunds. Card payoffs stay out. Remittances and e-transfers to people stay in. Click a bar to open that category below."
              rows={data.categories.slice(0, 10)}
              currency={data.currency}
              onSelect={(name) => {
                if (data.breakdowns.some((item) => item.category === name)) {
                  setCategory(name);
                }
              }}
            />
            <NetLineChart data={data} />
          </div>
          <StackedMixChart
            title="Cost mix over time"
            info="Stacked monthly lifestyle spend. Top categories stay named; the rest roll into Other."
            series={data.categorySeries}
            monthly={data.categoryMonthly}
            currency={data.currency}
          />
          <CategoryDrilldown
            data={data}
            selected={category}
            onSelect={setCategory}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <RankedBarChart
              title="Top merchants"
              info="From Transaction Enrichment and Transaction Entities (company, then brand, then cleaned merchant)."
              rows={data.merchants}
              currency={data.currency}
              color="oklch(0.55 0.12 35)"
              labelWidth={140}
            />
            <RankedBarChart
              title="Places"
              info="From Transaction Locations. City when present, else region. Online-only rows with no city are skipped."
              rows={data.places}
              currency={data.currency}
              color="oklch(0.48 0.09 300)"
            />
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
      ) : null}
    </div>
    </TooltipProvider>
  );
}
