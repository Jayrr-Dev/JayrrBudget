"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PageSpinner } from "@/components/ui/spinner";
import { TitleInfo } from "@/domains/ops/ui/TitleInfo";
import { formatUsd } from "@/shared/ai/aiCostTable";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

const TREND_CONFIG = {
  platformUsd: { label: "App key", color: "var(--chart-1)" },
  byokUsd: { label: "User keys", color: "var(--chart-2)" },
} satisfies ChartConfig;

const MIX_CONFIG = {
  usd: { label: "USD", color: "var(--chart-3)" },
} satisfies ChartConfig;

function money(value: number) {
  if (!Number.isFinite(value) || value === 0) return "$0";
  if (value < 0.01) return formatUsd(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function deltaHint(current: number, previous: number) {
  if (previous === 0 && current === 0) return "Same as last month";
  if (previous === 0) return "No cost last month";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Flat vs last month";
  if (pct > 0) return `+${pct}% vs last month`;
  return `${pct}% vs last month`;
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="type-kicker">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function RevenueDashboard() {
  const { isAuthenticated } = useConvexAuth();
  const now = useMemo(() => Date.now(), []);
  const data = useQuery(
    api.revenue.dashboard,
    isAuthenticated ? { now } : "skip",
  );

  if (data === undefined) {
    return <PageSpinner />;
  }

  const months = data.months.map((row) => ({
    ...row,
    label: monthLabel(row.monthKey),
  }));
  const current = months[months.length - 1];
  const mix = [
    { name: "App key", usd: data.kpis.monthPlatformUsd },
    { name: "User keys", usd: data.kpis.monthByokUsd },
  ];

  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <TitleInfo
          title="Revenue"
          lead="AI cost versus Polar Premium revenue."
          bullets={[
            "App key is what you pay on the shared OpenRouter / OCR bill",
            "User keys are BYOK and do not hit the platform",
            "MRR is Polar’s Premium price times Premium accounts",
          ]}
        />
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="App cost this month"
          value={money(data.kpis.monthPlatformUsd)}
          hint={deltaHint(
            data.kpis.monthPlatformUsd,
            data.kpis.prevPlatformUsd,
          )}
        />
        <Kpi
          label="Per person"
          value={money(data.kpis.costPerUser)}
          hint={`${data.kpis.userCount} accounts`}
        />
        <Kpi
          label="App calls"
          value={String(data.kpis.platformCalls)}
          hint="Platform-billed AI / OCR"
        />
        <Kpi
          label="Polar MRR"
          value={money(data.polar.mrr)}
          hint={
            data.polar.connected
              ? `${data.polar.subscribers} Premium`
              : "Sync Polar products on Profile"
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:col-span-3">
          <TitleInfo
            heading="h2"
            title="Cost trend"
            lead="Estimated USD by UTC month."
          />
          <ChartContainer
            config={TREND_CONFIG}
            className="aspect-[8/3] w-full"
            initialDimension={{ width: 640, height: 220 }}
          >
            <AreaChart
              data={months}
              margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value) => money(Number(value))}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label =
                        TREND_CONFIG[name as keyof typeof TREND_CONFIG]
                          ?.label ?? String(name);
                      return (
                        <span className="flex w-full justify-between gap-4">
                          <span>{label}</span>
                          <span className="tabular-nums">
                            {money(Number(value))}
                          </span>
                        </span>
                      );
                    }}
                  />
                }
              />
              <Area
                dataKey="platformUsd"
                type="monotone"
                stackId="cost"
                fill="var(--color-platformUsd)"
                fillOpacity={0.25}
                stroke="var(--color-platformUsd)"
                strokeWidth={2}
              />
              <Area
                dataKey="byokUsd"
                type="monotone"
                stackId="cost"
                fill="var(--color-byokUsd)"
                fillOpacity={0.2}
                stroke="var(--color-byokUsd)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:col-span-2">
          <TitleInfo
            heading="h2"
            title="This month"
            lead="Who paid for tokens and OCR pages."
          />
          <ChartContainer
            config={MIX_CONFIG}
            className="aspect-[5/4] w-full"
            initialDimension={{ width: 280, height: 200 }}
          >
            <BarChart
              data={mix}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => money(Number(value))}
                  />
                }
              />
              <Bar dataKey="usd" fill="var(--color-usd)" radius={4} />
            </BarChart>
          </ChartContainer>
          {current ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {current.monthKey} · {current.platformCalls} app calls ·{" "}
              {current.byokCalls} BYOK calls
            </p>
          ) : null}
        </section>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6">
        <TitleInfo
          heading="h2"
          title="Polar"
          lead="Premium checkout is Polar. Cost above is still AI spend, not Polar fees."
          bullets={[
            "Subscribers are accounts Polar marked Premium",
            "Price comes from the synced Polar product",
            "Sync products from Profile if the catalog is empty",
          ]}
        />
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="type-kicker">Status</dt>
            <dd className="mt-1 text-sm">
              {data.polar.connected ? "Connected" : "Not synced"}
            </dd>
          </div>
          <div>
            <dt className="type-kicker">Product</dt>
            <dd className="mt-1 text-sm">
              {data.polar.productName ?? "—"}
              {data.polar.priceUsd != null
                ? ` · ${money(data.polar.priceUsd)}/mo`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="type-kicker">Subscribers</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {data.polar.subscribers}
            </dd>
          </div>
          <div>
            <dt className="type-kicker">ARR</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {money(data.polar.arr)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
