"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AI_COST_TABLE,
  formatRatePerMillion,
  formatUsd,
} from "@/shared/ai/aiCostTable";
import {
  clearAiUsageDebugEvents,
  getAiUsageDebugEvents,
  subscribeAiUsageDebug,
  type AiUsageDebugEvent,
} from "@/shared/debug/aiUsageDebug";
import {
  clearVaultCacheDebugEvents,
  getVaultCacheDebugEvents,
  isVaultCacheDebugCapturing,
  setVaultCacheDebugCapturing,
  subscribeVaultCacheDebug,
  type VaultCacheDebugEvent,
  type VaultCacheDebugKind,
} from "@/shared/debug/vaultCacheDebug";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Info, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const KIND_LABEL: Record<VaultCacheDebugKind, string> = {
  "cache-hit": "HIT",
  "cache-miss": "MISS",
  "cache-write": "WRITE",
  "network-read": "NET",
  decrypt: "DECRYPT",
};

const KIND_CLASS: Record<VaultCacheDebugKind, string> = {
  "cache-hit": "text-emerald-700",
  "cache-miss": "text-amber-700",
  "cache-write": "text-sky-700",
  "network-read": "text-violet-700",
  decrypt: "text-foreground",
};

function formatTime(at: number) {
  const d = new Date(at);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function CacheEventRow({ event }: { event: VaultCacheDebugEvent }) {
  const detail = event.detail
    ? Object.entries(event.detail)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" · ")
    : null;
  return (
    <li className="border-b border-[var(--border)]/60 py-1.5 last:border-0">
      <div className="flex items-baseline gap-2 font-mono text-[11px] leading-snug">
        <span className="shrink-0 text-[var(--muted-foreground)]">
          {formatTime(event.at)}
        </span>
        <span
          className={cn(
            "w-12 shrink-0 font-semibold tracking-wide",
            KIND_CLASS[event.kind],
          )}
        >
          {KIND_LABEL[event.kind]}
        </span>
        <span className="min-w-0 text-[var(--foreground)]">{event.message}</span>
      </div>
      {detail ? (
        <p className="mt-0.5 pl-[4.25rem] font-mono text-[10px] text-[var(--muted-foreground)]">
          {detail}
        </p>
      ) : null}
    </li>
  );
}

function AiUsageEventRow({ event }: { event: AiUsageDebugEvent }) {
  const amount =
    event.pages != null && event.pages > 0
      ? `${event.pages} pg`
      : event.totalTokens != null
        ? `${event.totalTokens} tok`
        : [
            event.inputTokens != null ? `in ${event.inputTokens}` : null,
            event.outputTokens != null ? `out ${event.outputTokens}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—";
  return (
    <li className="border-b border-[var(--border)]/60 py-1.5 last:border-0">
      <div className="flex items-baseline gap-2 font-mono text-[11px] leading-snug">
        <span className="shrink-0 text-[var(--muted-foreground)]">
          {formatTime(event.at)}
        </span>
        <span className="min-w-0 font-semibold text-[var(--foreground)]">
          {event.source}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-[var(--muted-foreground)]">
          {amount}
        </span>
        <span className="w-14 shrink-0 text-right tabular-nums text-[var(--accent)]">
          {formatUsd(event.estimatedUsd)}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
        {[
          event.modelId,
          event.inputTokens != null ? `in=${event.inputTokens}` : null,
          event.outputTokens != null ? `out=${event.outputTokens}` : null,
          event.pages != null ? `pages=${event.pages}` : null,
          event.ms != null ? `${event.ms}ms` : null,
          event.detail,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}

function AiCostRatesTable() {
  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-[10px] font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
        Rate card · est. only
      </p>
      <table className="w-full border-collapse font-mono text-[10px]">
        <thead>
          <tr className="text-left text-[var(--muted-foreground)]">
            <th className="pb-1 font-medium">Model</th>
            <th className="pb-1 text-right font-medium">In / Out</th>
          </tr>
        </thead>
        <tbody>
          {AI_COST_TABLE.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="py-0.5 pr-2 text-[var(--foreground)]">
                <div>{row.label}</div>
                <div className="text-[var(--muted-foreground)]">{row.id}</div>
              </td>
              <td className="py-0.5 text-right tabular-nums whitespace-nowrap text-[var(--foreground)]">
                {row.unit === "tokens" ? (
                  <>
                    {formatRatePerMillion(row.inputPerMillionUsd)} /{" "}
                    {formatRatePerMillion(row.outputPerMillionUsd)}
                    <div className="text-[var(--muted-foreground)]">/1M tok</div>
                  </>
                ) : (
                  <>
                    {formatUsd(row.perPageUsd)}
                    <div className="text-[var(--muted-foreground)]">/page</div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">
        OpenRouter list + Mistral OCR $4/1k pages. As of{" "}
        {AI_COST_TABLE[0]?.asOf ?? "—"}.
      </p>
    </div>
  );
}

function DebuggerAboutInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="About debugger"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-72 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Admin debugger</PopoverTitle>
          <PopoverDescription>
            Live tools for vault cache and AI token use. Admin only.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Cache logs IndexedDB hits and Convex ciphertext reads</li>
            <li>AI Usage logs tokens from Piggy / canvas and Mistral OCR pages</li>
            <li>Cost estimates use the rate card (OpenRouter + Mistral)</li>
            <li>Plaintext ledger never appears here</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export function useVaultCacheDebugAdmin() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  return me?.role === "admin";
}

/** Floating debug panel. Toggle lives in the shared FAB pill. */
export function VaultCacheDebugPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState("cache");
  const [aiSubTab, setAiSubTab] = useState<"usage" | "cost">("usage");
  const [capturing, setCapturing] = useState(isVaultCacheDebugCapturing);
  const [cacheEvents, setCacheEvents] = useState(() => [
    ...getVaultCacheDebugEvents(),
  ]);
  const [aiEvents, setAiEvents] = useState(() => [...getAiUsageDebugEvents()]);

  useEffect(() => {
    return subscribeVaultCacheDebug(() => {
      setCapturing(isVaultCacheDebugCapturing());
      setCacheEvents([...getVaultCacheDebugEvents()]);
    });
  }, []);

  useEffect(() => {
    return subscribeAiUsageDebug(() => {
      setAiEvents([...getAiUsageDebugEvents()]);
    });
  }, []);

  useEffect(() => {
    if (open && !isVaultCacheDebugCapturing()) {
      setVaultCacheDebugCapturing(true);
    }
  }, [open]);

  const aiTotals = useMemo(() => {
    let input = 0;
    let output = 0;
    let total = 0;
    let pages = 0;
    let estimatedUsd = 0;
    for (const event of aiEvents) {
      input += event.inputTokens ?? 0;
      output += event.outputTokens ?? 0;
      total +=
        event.totalTokens ??
        (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
      pages += event.pages ?? 0;
      estimatedUsd += event.estimatedUsd ?? 0;
    }
    return {
      input,
      output,
      total,
      pages,
      estimatedUsd,
      calls: aiEvents.length,
    };
  }, [aiEvents]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-[min(100vw-1.5rem,24rem)] flex-col overflow-hidden rounded-xl border border-[var(--border)]",
        "bg-[var(--background)] text-[var(--foreground)] shadow-lg ring-1 ring-[var(--border)]/40",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)]/80 px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">Debugger</h2>
        <DebuggerAboutInfo />
        <button
          type="button"
          aria-label="Close debugger"
          onClick={() => onOpenChange(false)}
          className="ml-auto inline-flex size-7 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        <div className="border-b border-[var(--border)]/80 px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="cache" className="flex-1">
              Cache
            </TabsTrigger>
            <TabsTrigger value="ai-usage" className="flex-1">
              AI Usage
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cache" className="mt-0 gap-0">
          <div className="flex items-center gap-1 border-b border-[var(--border)]/60 px-3 py-1.5">
            <button
              type="button"
              onClick={() =>
                setVaultCacheDebugCapturing(!isVaultCacheDebugCapturing())
              }
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                capturing
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]",
              )}
            >
              {capturing ? "Capturing" : "Paused"}
            </button>
            <button
              type="button"
              onClick={() => clearVaultCacheDebugEvents()}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
            >
              Clear
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto px-3 py-1">
            {cacheEvents.length === 0 ? (
              <li className="py-6 text-center text-xs text-[var(--muted-foreground)]">
                {capturing
                  ? "Waiting for cache or read…"
                  : "Turn on Capturing, then reload the ledger."}
              </li>
            ) : (
              cacheEvents.map((event) => (
                <CacheEventRow key={event.id} event={event} />
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="ai-usage" className="mt-0 gap-0">
          <div className="flex items-center gap-1 border-b border-[var(--border)]/60 px-3 py-1.5">
            <button
              type="button"
              aria-pressed={aiSubTab === "usage"}
              onClick={() => setAiSubTab("usage")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                aiSubTab === "usage"
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]",
              )}
            >
              Usage
            </button>
            <button
              type="button"
              aria-pressed={aiSubTab === "cost"}
              onClick={() => setAiSubTab("cost")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                aiSubTab === "cost"
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]",
              )}
            >
              Cost
            </button>
            {aiSubTab === "usage" ? (
              <button
                type="button"
                onClick={() => clearAiUsageDebugEvents()}
                className="ml-auto rounded-md px-2 py-1 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              >
                Clear
              </button>
            ) : null}
          </div>

          {aiSubTab === "cost" ? (
            <div className="max-h-72 overflow-y-auto">
              <AiCostRatesTable />
            </div>
          ) : (
            <>
              <div className="border-b border-[var(--border)]/60 px-3 py-1.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                {aiTotals.calls} call{aiTotals.calls === 1 ? "" : "s"} · in{" "}
                {aiTotals.input} · out {aiTotals.output}
                {aiTotals.pages > 0 ? ` · ${aiTotals.pages} pg` : ""} · est{" "}
                <span className="text-[var(--accent)]">
                  {formatUsd(aiTotals.estimatedUsd)}
                </span>
              </div>
              <ul className="max-h-56 overflow-y-auto px-3 py-1">
                {aiEvents.length === 0 ? (
                  <li className="py-6 text-center text-xs text-[var(--muted-foreground)]">
                    Send a Piggy / canvas chat, or upload a statement with
                    server OCR.
                  </li>
                ) : (
                  aiEvents.map((event) => (
                    <AiUsageEventRow key={event.id} event={event} />
                  ))
                )}
              </ul>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
