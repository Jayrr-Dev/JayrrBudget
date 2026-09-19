"use client";

import {
  isPiggyIconName,
  PiggyIcon,
  type PiggyIconName,
} from "@/components/ui/piggy-icon";
import { resolveNextPingDate } from "@/domains/piggy-pings/domain/resolveNextPingDate";
import {
  cycleDisplay,
  pingTypeLabel,
  type PingType,
} from "@/domains/piggy-pings/domain/types";
import { formatCompactDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import { cn } from "cn";
import { useQuery } from "convex/react";
import Link from "next/link";

type DashboardPing = {
  id: string;
  name: string;
  title: string;
  icon: string;
  pingType: PingType;
  pingTypes: PingType[];
  cycle: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: number;
};

function pingIcon(value: string): PiggyIconName {
  if (isPiggyIconName(value)) return value;
  return "pings";
}

function primaryType(ping: DashboardPing): PingType {
  const first = ping.pingTypes[0];
  if (first) return first;
  return ping.pingType;
}

function nextDateLabel(ping: DashboardPing): string {
  const next = resolveNextPingDate({
    cycle: ping.cycle,
    startDate: ping.startDate,
    endDate: ping.endDate,
    createdAt: ping.createdAt,
  });
  if (next.kind === "ended") return "Ended";
  if (next.kind === "none") return "None";
  if (next.kind === "trigger") return "On trigger";
  return formatCompactDisplayDate(next.ymd);
}

function nextSortValue(ping: DashboardPing): string {
  const next = resolveNextPingDate({
    cycle: ping.cycle,
    startDate: ping.startDate,
    endDate: ping.endDate,
    createdAt: ping.createdAt,
  });
  if (next.kind === "date") return `0-${next.ymd}`;
  if (next.kind === "none") return "1-none";
  if (next.kind === "ended") return "2-ended";
  return "3-other";
}

function DashboardPingCard({ ping }: { ping: DashboardPing }) {
  const next = nextDateLabel(ping);
  const type = pingTypeLabel(primaryType(ping));

  return (
    <article
      className={cn(
        "flex h-full items-center gap-4 rounded-2xl border border-border bg-surface-elevated px-4 py-3.5 transition-colors hover:border-foreground/25",
        ping.isActive ? null : "opacity-60",
      )}
      aria-label={`${ping.name}, next ${next}`}
    >
      <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-piggy-100">
        <PiggyIcon name={pingIcon(ping.icon)} className="size-8" />
      </span>
      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-sm font-semibold tracking-wide uppercase"
          title={ping.name}
        >
          {ping.name}
        </h3>
        <p className="truncate text-xs text-foreground-muted" title={ping.title}>
          {ping.title}
        </p>
        <p className="mt-2 text-lg font-medium tabular-nums">{next}</p>
        <p className="mt-1 flex items-center justify-between gap-2 text-xs text-foreground-muted">
          <span className="min-w-0 truncate">{cycleDisplay(ping.cycle)}</span>
          <span>{type}</span>
        </p>
      </div>
    </article>
  );
}

export function DashboardPings() {
  const pings = useQuery(api.piggyPings.list, {});
  if (!pings || pings.length === 0) return null;

  const rows = [...pings].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const byNext = nextSortValue(a).localeCompare(nextSortValue(b));
    if (byNext !== 0) return byNext;
    return a.name.localeCompare(b.name);
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <h2 className="text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/piggy-pings" className="hover:text-foreground">
            Pings
          </Link>
        </h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        {rows.map((ping) => (
          <Link
            key={ping.id}
            href="/piggy-pings"
            className="col-span-1 min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2"
          >
            <DashboardPingCard ping={ping} />
          </Link>
        ))}
      </div>
    </section>
  );
}
