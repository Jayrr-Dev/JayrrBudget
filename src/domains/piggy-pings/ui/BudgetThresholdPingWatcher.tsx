"use client";

import { budgetProgressTone } from "@/domains/budgets/domain/budgetProgress";
import { useBudgetProgressItems } from "@/domains/budgets/ui/useBudgetProgressItems";
import {
  budgetNameFromTrigger,
  budgetPingFireKey,
  triggerHasOver,
  triggerHasWarn,
} from "@/domains/piggy-pings/domain/budgetPingTrigger";
import { isTriggeredCycle, type PingType } from "@/domains/piggy-pings/domain/types";
import { usePiggyPingRuntime } from "@/domains/piggy-pings/ui/PiggyPingRuntime";
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

function pingTypesOf(ping: {
  pingType: PingType;
  pingTypes: PingType[];
}): PingType[] {
  return ping.pingTypes.length > 0 ? ping.pingTypes : [ping.pingType];
}

function todayYmd() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pingInWindow(
  ping: { startDate: string | null; endDate: string | null },
  today: string,
) {
  if (ping.startDate && today < ping.startDate) return false;
  if (ping.endDate && today > ping.endDate) return false;
  return true;
}

export function BudgetThresholdPingWatcher() {
  const { rows, progressItems } = useBudgetProgressItems();
  const pings = useQuery(api.piggyPings.list, {});
  const recordFire = useMutation(api.piggyPings.recordFire);
  const { deliver } = usePiggyPingRuntime();
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    if (!pings) return;
    const today = todayYmd();
    const progressById = new Map(
      progressItems.map((item) => [item.id, item]),
    );

    for (const budget of rows) {
      if (!budget.isActive) continue;
      const progress = progressById.get(budget.id);
      if (!progress) continue;
      const tone = budgetProgressTone(
        progress.percent,
        budget.warningThreshold,
        budget.overageThreshold,
      );
      const events: Array<"warn" | "over"> = [];
      if (tone === "warn" || tone === "over") events.push("warn");
      if (tone === "over") events.push("over");
      if (events.length === 0) continue;

      const links = new Map(
        budget.pingLinks.map((link) => [link.pingId, link]),
      );
      for (const ping of pings) {
        if (!ping.isActive) continue;
        if (!isTriggeredCycle(ping.cycle)) continue;
        if (!pingInWindow(ping, today)) continue;
        const triggerName = budgetNameFromTrigger(ping.trigger);
        const linked = links.get(ping.id);
        const sameBudget =
          triggerName.toLowerCase() === budget.name.trim().toLowerCase();
        if (!linked && !sameBudget) continue;
        const warn = ping.trigger
          ? triggerHasWarn(ping.trigger)
          : Boolean(linked?.warn);
        const over = ping.trigger
          ? triggerHasOver(ping.trigger)
          : Boolean(linked?.over);
        for (const event of events) {
          if (event === "warn" && !warn) continue;
          if (event === "over" && !over) continue;
          const fireKey = budgetPingFireKey(
            ping.id,
            budget.id,
            progress.periodStart,
            event,
          );
          if (inflight.current.has(fireKey)) continue;
          if ((ping.firedKeys ?? []).includes(fireKey)) continue;
          inflight.current.add(fireKey);
          void recordFire({ pingId: ping.id, fireKey })
            .then((result) => {
              if (!result.fired) return;
              deliver({
                title: ping.title,
                message: ping.message,
                pingTypes: pingTypesOf(ping),
                icon: ping.icon,
                tone: event,
              });
            })
            .catch(() => {
              inflight.current.delete(fireKey);
            });
        }
      }
    }
  }, [deliver, pings, progressItems, recordFire, rows]);

  return null;
}
