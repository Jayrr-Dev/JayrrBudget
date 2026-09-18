"use client";

import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import type { RowActionsMenuItem } from "@/components/ui/row-actions-menu";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import type { CategorizationSummary } from "@/domains/statements/domain/importResult";
import { applyVaultCategorization } from "@/domains/vault/application/applyVaultCategorization";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { toast } from "sonner";

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

/** Header clicker: re-run categorization on visible transactions. */
export function TransactionBulkActions({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();

  const rerun = useMutation({
    mutationFn: async (visible: DashboardTransaction[]) => {
      if (!privateLedger.encryptedLedger || !privateLedger.unlocked) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const masterKey = getVaultMasterKey();
      if (
        !privateLedger.userId ||
        !privateLedger.vaultId ||
        !privateLedger.keyId ||
        !masterKey
      ) {
        throw new Error("Sign in again, then re-run.");
      }

      let summary = emptySummary();
      const chunkSize = 40;
      for (let i = 0; i < visible.length; i += chunkSize) {
        const chunk = visible.slice(i, i + chunkSize);
        const response = await fetch("/api/statements/categorize-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skipCache: true,
            transactions: chunk.map((txn) => ({
              transactionId: txn.transactionId,
              description: txn.name,
              amount: Number(txn.amount),
            })),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Recategorize failed");
        }
        await applyVaultCategorization({
          client: client as unknown as MutationClient,
          userId: privateLedger.userId,
          vaultId: privateLedger.vaultId,
          keyId: privateLedger.keyId,
          masterKey,
          ledger: privateLedger.ledger,
          labeled: result.labeled,
        });
        summary = addSummaries(
          summary,
          result.summary as CategorizationSummary,
        );
      }
      privateLedger.reload();
      return summary;
    },
    onSuccess: async (result) => {
      const description = `${result.cached} reused, ${result.ai} categorized, ${result.pending} pending.`;
      if (result.ok) {
        toast.success("Re-run complete", {
          description,
          id: "txn-bulk-rerun",
        });
      } else {
        toast.warning("Re-run needs attention", {
          description: result.error ?? description,
          id: "txn-bulk-rerun",
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Re-run failed", {
        description: error instanceof Error ? error.message : String(error),
        id: "txn-bulk-rerun",
      }),
  });

  const actions: RowActionsMenuItem[] = [
    {
      label: rerun.isPending
        ? "Re-running…"
        : `Re-run visible (${transactions.length})`,
      onSelect: () => rerun.mutate(transactions),
      disabled: rerun.isPending || transactions.length === 0,
    },
  ];

  return (
    <BulkActionsMenu
      label="visible transactions"
      actions={actions}
      disabled={transactions.length === 0 || rerun.isPending}
    />
  );
}
