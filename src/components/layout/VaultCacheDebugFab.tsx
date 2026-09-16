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
import { DockPanelResizeGrip } from "@/components/layout/DockPanelResizeGrip";
import {
  DOCK_PANEL_DEFAULT_WIDTH,
  useDockPanelSize,
  type DockPanelAnchor,
} from "@/components/layout/useDockPanelSize";
import { cn } from "@/lib/utils";
import {
  AI_COST_TABLE,
  formatRatePerMillion,
  formatUsd,
  utcMonthKey,
} from "@/shared/ai/aiCostTable";
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

/** Default height of each scrolling list; the user drags the corner to change it. */
const DEBUG_BODY_DEFAULT_PX = 288;

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

function AiUsageEventRow({
  event,
}: {
  event: {
    id: string;
    source: string;
    modelId: string;
    billedTo: string;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    pages: number | null;
    estimatedUsd: number | null;
    ms: number | null;
    createdAt: number;
  };
}) {
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
          {formatTime(event.createdAt)}
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
          event.billedTo,
          event.inputTokens != null ? `in=${event.inputTokens}` : null,
          event.outputTokens != null ? `out=${event.outputTokens}` : null,
          event.pages != null ? `pages=${event.pages}` : null,
          event.ms != null ? `${event.ms}ms` : null,
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
      <table className="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr className="text-left text-[var(--muted-foreground)]">
            <th className="pb-1.5 font-medium">Model</th>
            <th className="pb-1.5 text-right font-medium">Rate</th>
          </tr>
        </thead>
        <tbody>
          {AI_COST_TABLE.map((row) => (
            <tr key={row.id}>
              <td className="py-1 pr-3 text-[var(--foreground)]">{row.label}</td>
              <td className="py-1 text-right tabular-nums whitespace-nowrap text-[var(--foreground)]">
                {row.unit === "tokens"
                  ? `${formatRatePerMillion(row.inputPerMillionUsd)} / ${formatRatePerMillion(row.outputPerMillionUsd)} /1M`
                  : `${formatUsd(row.perPageUsd)} /page`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MEMORY_LISTS: Array<{
  key:
    | "basicInfo"
    | "goals"
    | "painPoints"
    | "preferences"
    | "wins"
    | "followUps";
  label: string;
}> = [
  { key: "basicInfo", label: "Basic info" },
  { key: "goals", label: "Goals" },
  { key: "painPoints", label: "Pain points" },
  { key: "preferences", label: "Preferences" },
  { key: "wins", label: "Wins" },
  { key: "followUps", label: "Follow-ups" },
];

function formatDateTime(at: number) {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function PiggyMemoryView({
  memory,
}: {
  memory: (typeof api.piggyMemory.get)["_returnType"] | undefined;
}) {
  if (memory === undefined) {
    return (
      <p className="py-6 text-center text-xs text-[var(--muted-foreground)]">
        Loading memory…
      </p>
    );
  }
  const hasFacts =
    memory.nickname != null ||
    memory.lastSessionSummary != null ||
    MEMORY_LISTS.some(({ key }) => memory[key].length > 0);
  if (!hasFacts && memory.sessionCount === 0) {
    return (
      <p className="py-6 text-center text-xs text-[var(--muted-foreground)]">
        Piggy has not saved anything yet. Chat with Piggy first.
      </p>
    );
  }
  return (
    <div className="px-3 py-2 font-mono text-[11px]">
      <p className="text-[10px] text-[var(--muted-foreground)]">
        {memory.sessionCount} session{memory.sessionCount === 1 ? "" : "s"}
        {memory.lastSessionAt != null
          ? ` · last ${formatDateTime(memory.lastSessionAt)}${
              memory.lastSessionScope ? ` (${memory.lastSessionScope})` : ""
            }`
          : ""}
        {memory.updatedAt != null
          ? ` · updated ${formatDateTime(memory.updatedAt)}`
          : ""}
      </p>
      {memory.nickname ? (
        <p className="mt-1.5">
          <span className="text-[var(--muted-foreground)]">nickname </span>
          <span className="text-[var(--foreground)]">{memory.nickname}</span>
        </p>
      ) : null}
      {memory.lastSessionSummary ? (
        <div className="mt-1.5">
          <p className="font-semibold text-[var(--accent)]">Last session</p>
          <p className="text-[var(--foreground)]">{memory.lastSessionSummary}</p>
        </div>
      ) : null}
      {MEMORY_LISTS.map(({ key, label }) => {
        const items = memory[key];
        if (items.length === 0) return null;
        return (
          <div key={key} className="mt-1.5">
            <p className="font-semibold text-[var(--accent)]">
              {label}{" "}
              <span className="font-normal text-[var(--muted-foreground)]">
                ({items.length})
              </span>
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-[var(--foreground)]">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        );
      })}
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
            <li>Memory shows what Piggy has saved about you</li>
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
  anchor = "bottom-right",
  onOpenChange,
}: {
  open: boolean;
  anchor?: DockPanelAnchor;
  onOpenChange: (open: boolean) => void;
}) {
  const resize = useDockPanelSize({
    storageKey: "debugger-panel-size",
    defaultSize: { width: DOCK_PANEL_DEFAULT_WIDTH, bodyHeight: DEBUG_BODY_DEFAULT_PX },
    anchor,
  });
  const [tab, setTab] = useState("cache");
  const [aiSubTab, setAiSubTab] = useState<
    "usage" | "cost" | "team" | "memory"
  >("usage");
  const [capturing, setCapturing] = useState(isVaultCacheDebugCapturing);
  const [cacheEvents, setCacheEvents] = useState(() => [
    ...getVaultCacheDebugEvents(),
  ]);
  const { isAuthenticated } = useConvexAuth();
  const monthKey = useMemo(() => utcMonthKey(Date.now()), []);
  const aiEvents = useQuery(
    api.aiUsage.myRecent,
    isAuthenticated && open ? {} : "skip",
  );
  const teamMonth = useQuery(
    api.aiUsage.adminMonth,
    isAuthenticated && open && aiSubTab === "team" ? { monthKey } : "skip",
  );
  const piggyMemory = useQuery(
    api.piggyMemory.get,
    isAuthenticated && open && aiSubTab === "memory" ? {} : "skip",
  );

  useEffect(() => {
    return subscribeVaultCacheDebug(() => {
      setCapturing(isVaultCacheDebugCapturing());
      setCacheEvents([...getVaultCacheDebugEvents()]);
    });
  }, []);

  useEffect(() => {
    if (open && !isVaultCacheDebugCapturing()) {
      setVaultCacheDebugCapturing(true);
    }
  }, [open]);

  const aiTotals = useMemo(() => {
    const events = aiEvents ?? [];
    let input = 0;
    let output = 0;
    let total = 0;
    let pages = 0;
    let estimatedUsd = 0;
    for (const event of events) {
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
      calls: events.length,
    };
  }, [aiEvents]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-[var(--border)]",
        "bg-[var(--background)] text-[var(--foreground)] shadow-lg ring-1 ring-[var(--border)]/40",
        resize.resizing && "select-none",
      )}
      style={{
        width: resize.size.width,
        ["--dock-body-h" as string]: `${resize.size.bodyHeight}px`,
      }}
    >
      <DockPanelResizeGrip label="debugger" resize={resize} />
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
          <ul className="max-h-(--dock-body-h) overflow-y-auto px-3 py-1">
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
              aria-pressed={aiSubTab === "team"}
              onClick={() => setAiSubTab("team")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                aiSubTab === "team"
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]",
              )}
            >
              Team
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
            <button
              type="button"
              aria-pressed={aiSubTab === "memory"}
              onClick={() => setAiSubTab("memory")}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                aiSubTab === "memory"
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]",
              )}
            >
              Memory
            </button>
          </div>

          {aiSubTab === "cost" ? (
            <div className="max-h-(--dock-body-h) overflow-y-auto">
              <AiCostRatesTable />
            </div>
          ) : aiSubTab === "memory" ? (
            <div className="max-h-(--dock-body-h) overflow-y-auto">
              <PiggyMemoryView memory={piggyMemory} />
            </div>
          ) : aiSubTab === "team" ? (
            <ul className="max-h-(--dock-body-h) overflow-y-auto px-3 py-1">
              {teamMonth === undefined ? (
                <li className="py-6 text-center text-xs text-[var(--muted-foreground)]">
                  Loading team month…
                </li>
              ) : teamMonth.length === 0 ? (
                <li className="py-6 text-center text-xs text-[var(--muted-foreground)]">
                  No recorded AI use this month.
                </li>
              ) : (
                teamMonth.map((row) => (
                  <li
                    key={row.userId}
                    className="border-b border-[var(--border)]/60 py-1.5 last:border-0"
                  >
                    <div className="flex items-baseline gap-2 font-mono text-[11px]">
                      <span className="min-w-0 truncate">
                        {row.email ?? row.name ?? row.userId}
                      </span>
                      <span className="ml-auto tabular-nums text-[var(--accent)]">
                        {formatUsd(
                          row.platform.estimatedUsd + row.byok.estimatedUsd,
                        )}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-[var(--muted-foreground)]">
                      app {formatUsd(row.platform.estimatedUsd)} · byok{" "}
                      {formatUsd(row.byok.estimatedUsd)} ·{" "}
                      {row.platform.callCount + row.byok.callCount} calls
                    </p>
                  </li>
                ))
              )}
            </ul>
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
              <ul className="max-h-(--dock-body-h) overflow-y-auto px-3 py-1">
                {aiEvents === undefined ? (
                  <li className="py-6 text-center text-xs text-[var(--muted-foreground)]">
                    Loading usage…
                  </li>
                ) : aiEvents.length === 0 ? (
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
