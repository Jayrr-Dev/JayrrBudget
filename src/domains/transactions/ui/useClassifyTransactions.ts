"use client";

import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import type { LabeledTransaction } from "@/domains/statements/application/categorizeStatement";
import type { CategorizationSummary } from "@/domains/statements/domain/importResult";
import { applyVaultCategorization } from "@/domains/vault/application/applyVaultCategorization";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { toastIfOffline } from "@/shared/offline/offlineWriteGuard";
import { merchantRuleKey } from "@convex/lib/categorization";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const CLASSIFY_CHUNK = 50;
const CLASSIFY_TOAST = "transactions-classify";

type ClassifyProgress = { done: number; total: number };

const progressListeners = new Set<() => void>();
let classifyProgress: ClassifyProgress | null = null;

function publishClassifyProgress(next: ClassifyProgress | null) {
  classifyProgress = next;
  for (const listener of progressListeners) listener();
}

export function useClassifyProgress() {
  const [value, setValue] = useState(classifyProgress);
  useEffect(() => {
    const listener = () => setValue(classifyProgress);
    progressListeners.add(listener);
    return () => {
      progressListeners.delete(listener);
    };
  }, []);
  return value;
}

function emptySummary(): CategorizationSummary {
  return { ok: true, cached: 0, ai: 0, pending: 0 };
}

function addSummaries(
  left: CategorizationSummary,
  right: CategorizationSummary,
): CategorizationSummary {
  return {
    ok: left.ok ? right.ok : false,
    cached: left.cached + right.cached,
    ai: left.ai + right.ai,
    pending: left.pending + right.pending,
    error: right.error ?? left.error,
  };
}

export function needsClassify(txn: DashboardTransaction) {
  return !txn.categoryName?.trim();
}

type KeyGroup = { key: string; rows: DashboardTransaction[] };

function groupByDescription(rows: DashboardTransaction[]) {
  const groups: KeyGroup[] = [];
  const index = new Map<string, KeyGroup>();
  for (const txn of rows) {
    const key = merchantRuleKey(txn.name, Number(txn.amount));
    const existing = index.get(key);
    if (existing) {
      existing.rows.push(txn);
      continue;
    }
    const group = { key, rows: [txn] };
    index.set(key, group);
    groups.push(group);
  }
  return groups;
}

/** One Jev answer covers every row that shares the description key. */
function fanLabels(labeled: LabeledTransaction[], groups: KeyGroup[]) {
  const byRepId = new Map(
    groups.map((group) => [group.rows[0]!.transactionId, group]),
  );
  const hit = new Set<string>();
  const fanned: LabeledTransaction[] = [];
  for (const label of labeled) {
    const group = byRepId.get(label.transactionId);
    if (!group) {
      fanned.push(label);
      continue;
    }
    hit.add(group.key);
    for (const txn of group.rows) {
      fanned.push({ ...label, transactionId: txn.transactionId });
    }
  }
  let failedRows = 0;
  for (const group of groups) {
    if (!hit.has(group.key)) failedRows += group.rows.length;
  }
  return { fanned, failedRows };
}

type ClassifyStreamEvent =
  | { type: "labeled"; item: LabeledTransaction }
  | { type: "done"; summary: CategorizationSummary }
  | { type: "error"; error: string };

function showClassifyCount(done: number, total: number) {
  publishClassifyProgress({ done, total });
  toast.loading(`Classifying ${done} of ${total}`, { id: CLASSIFY_TOAST });
}

async function readClassifyStream(
  response: Response,
  onLabeled: (item: LabeledTransaction) => void,
) {
  if (!response.body) throw new Error("Classification failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let summary = emptySummary();
  const take = async (line: string) => {
    const event = JSON.parse(line) as ClassifyStreamEvent;
    if (event.type === "labeled") {
      onLabeled(event.item);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return;
    }
    if (event.type === "done") {
      summary = event.summary;
      return;
    }
    throw new Error(event.error || "Classification failed");
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) await take(line);
    }
  }
  if (buffer.trim()) await take(buffer);
  return summary;
}

export function useClassifyTransactions() {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();

  return useMutation({
    mutationFn: async (rows: DashboardTransaction[]) => {
      if (toastIfOffline()) {
        throw new Error("You're offline. Try again when you're connected.");
      }
      if (!privateLedger.encryptedLedger || !privateLedger.unlocked) {
        throw new Error("Unlock your private ledger to classify.");
      }
      const masterKey = getVaultMasterKey();
      if (
        !privateLedger.userId ||
        !privateLedger.vaultId ||
        !privateLedger.keyId ||
        !masterKey
      ) {
        throw new Error("Sign in again, then classify.");
      }

      const groups = groupByDescription(rows);
      showClassifyCount(0, rows.length);
      let summary = emptySummary();
      let resolved = 0;
      let ledger = privateLedger.ledger;
      try {
        for (let i = 0; i < groups.length; i += CLASSIFY_CHUNK) {
          const chunk = groups.slice(i, i + CLASSIFY_CHUNK);
          const byRepId = new Map(
            chunk.map((group) => [group.rows[0]!.transactionId, group]),
          );
          const labeled: LabeledTransaction[] = [];
          const seen = new Set<string>();
          let chunkRows = 0;
          let chunkDone = 0;
          const response = await fetch("/api/statements/categorize-vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stream: true,
              transactions: chunk.map((group) => {
                const txn = group.rows[0]!;
                chunkRows += group.rows.length;
                return {
                  transactionId: txn.transactionId,
                  description: txn.name,
                  amount: Number(txn.amount),
                };
              }),
            }),
          });
          if (!response.ok) {
            const result = (await response.json()) as { error?: string };
            throw new Error(result.error ?? "Classification failed");
          }
          const chunkSummary = await readClassifyStream(response, (item) => {
            if (seen.has(item.transactionId)) return;
            seen.add(item.transactionId);
            labeled.push(item);
            const group = byRepId.get(item.transactionId);
            chunkDone += group ? group.rows.length : 1;
            showClassifyCount(resolved + chunkDone, rows.length);
          });
          const { fanned, failedRows } = fanLabels(labeled, chunk);
          ledger = await applyVaultCategorization({
            client: client as unknown as MutationClient,
            userId: privateLedger.userId,
            vaultId: privateLedger.vaultId,
            keyId: privateLedger.keyId,
            masterKey,
            ledger,
            labeled: fanned,
          });
          summary = addSummaries(summary, {
            ok: chunkSummary.ok ? failedRows === 0 : false,
            cached:
              chunkSummary.cached + Math.max(0, fanned.length - labeled.length),
            ai: chunkSummary.ai,
            pending: failedRows,
            error: chunkSummary.error,
          });
          resolved += chunkRows;
          showClassifyCount(resolved, rows.length);
        }
        privateLedger.reload();
        return summary;
      } finally {
        publishClassifyProgress(null);
      }
    },
    onSuccess: async (result) => {
      const classified = result.cached + result.ai;
      const description =
        result.pending > 0
          ? `${classified} classified, ${result.pending} pending.`
          : `${classified} classified.`;
      if (result.ok) {
        toast.success("Classification complete", {
          description,
          id: CLASSIFY_TOAST,
        });
      } else {
        toast.warning("Classification needs attention", {
          description: result.error ?? description,
          id: CLASSIFY_TOAST,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Classification failed", {
        description: error instanceof Error ? error.message : String(error),
        id: CLASSIFY_TOAST,
      }),
  });
}
