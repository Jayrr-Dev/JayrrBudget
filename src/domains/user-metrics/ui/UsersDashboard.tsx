"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PageSpinner } from "@/components/ui/spinner";
import { TitleInfo } from "@/domains/ops/ui/TitleInfo";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const SIGNUP_CONFIG = {
  signups: { label: "Signups", color: "var(--chart-1)" },
} satisfies ChartConfig;

const USAGE_CONFIG = {
  hours: { label: "Hours", color: "var(--chart-3)" },
  activeUsers: { label: "People", color: "var(--chart-2)" },
} satisfies ChartConfig;

const ROLE_BAR: Record<string, string> = {
  normal: "bg-[var(--chart-2)]",
  premium: "bg-[var(--chart-1)]",
  admin: "bg-[var(--chart-3)]",
};

function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function formatWhen(ms: number | null) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function UsersDashboard() {
  const { isAuthenticated } = useConvexAuth();
  const now = useMemo(() => Date.now(), []);
  const data = useQuery(
    api.userMetrics.dashboard,
    isAuthenticated ? { now } : "skip",
  );

  if (data === undefined) {
    return <PageSpinner />;
  }

  const roleMax = Math.max(1, ...data.roles.map((row) => row.count));
  const kpis = data.kpis;

  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <TitleInfo
          title="Users"
          lead="Who signed up, how the base is growing, and how long people keep the app open."
          bullets={[
            "Signups use account create time",
            "Time in app only counts while this tab is visible",
            "DAU / WAU / MAU are unique people with a heartbeat in that window",
          ]}
        />
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="People" value={String(kpis.totalUsers)} hint={`${kpis.newThisMonth} new this month`} />
        <Kpi label="This week" value={`+${kpis.newThisWeek}`} hint="New accounts since Monday UTC" />
        <Kpi
          label="Active today"
          value={String(kpis.dau)}
          hint={`WAU ${kpis.wau} · MAU ${kpis.mau}`}
        />
        <Kpi
          label="Time today"
          value={`${kpis.todayHours}h`}
          hint={`Median ${kpis.todayMedianMinutes}m among people online`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:col-span-3">
          <TitleInfo
            heading="h2"
            title="Growth"
            lead="New accounts per week, Monday UTC."
          />
          <ChartContainer
            config={SIGNUP_CONFIG}
            className="aspect-auto h-60 w-full sm:aspect-[8/3] sm:h-auto"
            initialDimension={{ width: 640, height: 220 }}
          >
            <AreaChart data={data.signupWeeks} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="signups"
                type="monotone"
                fill="var(--color-signups)"
                fillOpacity={0.2}
                stroke="var(--color-signups)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:col-span-2">
          <TitleInfo
            heading="h2"
            title="Roles"
            lead="How accounts are split today."
          />
          <ul className="space-y-3">
            {data.roles.map((row) => (
              <li key={row.role} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="capitalize">{row.role}</span>
                  <span className="tabular-nums text-[var(--muted-foreground)]">
                    {row.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className={cn("h-full rounded-full", ROLE_BAR[row.role] ?? "bg-[var(--chart-1)]")}
                    style={{ width: `${Math.round((row.count / roleMax) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <TitleInfo
          heading="h2"
          title="Time in app"
          lead="Hours the tab was open, and how many people showed up each UTC day."
        />
        <ChartContainer
          config={USAGE_CONFIG}
          className="aspect-auto h-60 w-full sm:aspect-[3/1] sm:h-auto"
          initialDimension={{ width: 720, height: 220 }}
        >
          <BarChart data={data.usageDays} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
          </BarChart>
        </ChartContainer>
      </section>

      <section className="space-y-3">
        <TitleInfo
          heading="h2"
          title="Newest accounts"
          lead="Latest signups, last seen, and time in the last 7 days."
        />
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-2 font-medium">Person</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 font-medium text-right">This week</th>
              </tr>
            </thead>
            <tbody>
              {data.roster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                    No accounts yet.
                  </td>
                </tr>
              ) : (
                data.roster.map((row) => (
                  <tr key={row.userId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2">
                      <span className="block font-medium">
                        {row.name ?? row.email ?? "Untitled"}
                      </span>
                      {row.name != null && row.email != null ? (
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          {row.email}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 capitalize">{row.role}</td>
                    <td className="px-4 py-2 tabular-nums text-[var(--muted-foreground)]">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-[var(--muted-foreground)]">
                      {formatWhen(row.lastSeenAt)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatDuration(row.weekMs)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
