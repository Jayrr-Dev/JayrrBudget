"use client";

import { Icon } from "@iconify/react";
import { useConvex } from "convex/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import { applyVaultCategorization } from "@/domains/vault/application/applyVaultCategorization";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TransactionRowActions({
  transaction,
}: {
  transaction: DashboardTransaction;
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();

  const rerun = useMutation({
    mutationFn: async () => {
      const payload = {
        transactionId: transaction.transactionId,
        description: transaction.name,
        amount: Number(transaction.amount),
      };
      if (privateLedger.encryptedLedger) {
        const response = await fetch("/api/statements/categorize-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skipCache: true,
            transactions: [payload],
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Recategorize failed");
        const masterKey = getVaultMasterKey();
        if (!privateLedger.userId || !privateLedger.vaultId || !privateLedger.keyId || !masterKey) {
          throw new Error("Sign in again, then re-run.");
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
        privateLedger.reload();
        return result.summary as import("@/domains/statements/domain/importResult").CategorizationSummary;
      }
      const response = await fetch("/api/transactions/recategorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Recategorize failed");
      return result as import("@/domains/statements/domain/importResult").CategorizationSummary;
    },
    onSuccess: async (result) => {
      const description = `${result.cached} reused, ${result.ai} categorized, ${result.pending} pending.`;
      if (result.ok) toast.success("Re-run complete", { description });
      else toast.warning("Re-run needs attention", { description: result.error ?? description });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Re-run failed", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label={`Actions for ${transaction.name}`}
      >
        <Icon icon="basil:menu-outline" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36">
        <DropdownMenuItem
          disabled={rerun.isPending}
          onClick={() => rerun.mutate()}
        >
          {rerun.isPending ? "Re-running..." : "Re-run"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
