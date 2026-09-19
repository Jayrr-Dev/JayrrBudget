"use client";

import { Button } from "@/components/ui/button";
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
import { useConnectionState } from "@/shared/offline/useConnectionState";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { toast } from "sonner";

const CLASSIFY_CHUNK = 40;
const CLASSIFY_TOAST = "transactions-classify";

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

function needsClassify(txn: DashboardTransaction) {
  return !txn.categoryName?.trim();
}

export function ClassifyTransactionsButton({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const { isOffline } = useConnectionState();
  const pending = transactions.filter(needsClassify);

  const classify = useMutation({
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

      toast.loading(`Classifying ${rows.length} lines…`, {
        id: CLASSIFY_TOAST,
      });
      let summary = emptySummary();
      for (let i = 0; i < rows.length; i += CLASSIFY_CHUNK) {
        const chunk = rows.slice(i, i + CLASSIFY_CHUNK);
        const response = await fetch("/api/statements/categorize-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactions: chunk.map((txn) => ({
              transactionId: txn.transactionId,
              description: txn.name,
              amount: Number(txn.amount),
            })),
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          summary?: CategorizationSummary;
          labeled?: LabeledTransaction[];
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Classification failed");
        }
        await applyVaultCategorization({
          client: client as unknown as MutationClient,
          userId: privateLedger.userId,
          vaultId: privateLedger.vaultId,
          keyId: privateLedger.keyId,
          masterKey,
          ledger: privateLedger.ledger,
          labeled: result.labeled ?? [],
        });
        summary = addSummaries(summary, result.summary ?? emptySummary());
      }
      privateLedger.reload();
      return summary;
    },
    onSuccess: async (result) => {
      const description = `${result.cached} reused, ${result.ai} classified, ${result.pending} pending.`;
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

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending.length === 0 || classify.isPending || isOffline}
      onClick={() => classify.mutate(pending)}
    >
      {classify.isPending
        ? "Classifying…"
        : pending.length > 1
          ? `Classify ${pending.length}`
          : "Classify"}
    </Button>
  );
}
