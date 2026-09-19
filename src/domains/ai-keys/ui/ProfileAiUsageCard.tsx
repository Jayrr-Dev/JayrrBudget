"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatUsd, utcMonthKey } from "@/shared/ai/aiCostTable";
import { api } from "@convex/_generated/api";
import { useClientNow } from "@/shared/lib/useClientNow";
import { useConvexAuth, useQuery } from "convex/react";
import { Info } from "lucide-react";

function tokenLine(input: number, output: number) {
  return `${input} in / ${output} out`;
}

export function ProfileAiUsageCard() {
  const { isAuthenticated } = useConvexAuth();
  const now = useClientNow();
  const monthKey = now === undefined ? undefined : utcMonthKey(now);
  const month = useQuery(
    api.aiUsage.myMonth,
    isAuthenticated && monthKey ? { monthKey } : "skip",
  );
  const quota = useQuery(
    api.service.myQuota,
    isAuthenticated && monthKey ? { monthKey } : "skip",
  );
  const recent = useQuery(
    api.aiUsage.myRecent,
    isAuthenticated ? {} : "skip",
  );

  const platform = month?.platform;
  const byok = month?.byok;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
      <h2 className="type-section flex items-center gap-2">
        AI usage
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About AI usage"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-80 gap-0 p-3.5"
          >
            <PopoverHeader className="gap-1.5">
              <PopoverTitle>AI usage</PopoverTitle>
              <PopoverDescription>
                Tokens, OCR pages, and estimated USD for this UTC month.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>App key usage counts toward your monthly included cap</li>
                <li>Your own OpenRouter key is tracked separately and not capped</li>
                <li>Estimates use our published rates, not the provider invoice</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>

      {month === undefined ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-[var(--muted-foreground)]">App key</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatUsd(platform?.estimatedUsd ?? 0)}
            </p>
            <p className="mt-1 font-mono text-[11px] text-[var(--muted-foreground)]">
              {platform?.callCount ?? 0} calls ·{" "}
              {tokenLine(platform?.inputTokens ?? 0, platform?.outputTokens ?? 0)}
              {platform && platform.pages > 0 ? ` · ${platform.pages} pg` : ""}
            </p>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-[var(--muted-foreground)]">Your key</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatUsd(byok?.estimatedUsd ?? 0)}
            </p>
            <p className="mt-1 font-mono text-[11px] text-[var(--muted-foreground)]">
              {byok?.callCount ?? 0} calls ·{" "}
              {tokenLine(byok?.inputTokens ?? 0, byok?.outputTokens ?? 0)}
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        {quota
          ? `${quota.name} · remaining ${
              quota.remainingUsd == null ? "unlimited" : formatUsd(quota.remainingUsd)
            } of ${
              quota.monthlyCapUsd == null ? "no cap" : formatUsd(quota.monthlyCapUsd)
            } · ${monthKey} UTC`
          : `Month ${monthKey} UTC`}
      </p>

      {recent && recent.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto font-mono text-[11px]">
          {recent.slice(0, 12).map((event) => (
            <li
              key={event.id}
              className="flex items-baseline gap-2 border-b border-border/60 py-1.5 last:border-0"
            >
              <span className="min-w-0 truncate">{event.source}</span>
              <span className="ml-auto shrink-0 tabular-nums text-[var(--muted-foreground)]">
                {event.pages != null && event.pages > 0
                  ? `${event.pages} pg`
                  : `${event.totalTokens ?? 0} tok`}
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums">
                {formatUsd(event.estimatedUsd)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
