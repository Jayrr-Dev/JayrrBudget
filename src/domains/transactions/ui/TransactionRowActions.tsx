"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { getVaultMasterKey } from "@/crypto/session";
import {
  deletePrivateRecords,
  type MutationClient,
} from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import { EditDescriptionDialog } from "@/domains/transactions/ui/EditDescriptionDialog";
import { applyVaultCategorization } from "@/domains/vault/application/applyVaultCategorization";
import {
  skipNextPrivateLedgerReload,
  usePrivateLedger,
} from "@/domains/vault/ui/usePrivateLedger";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function TransactionRowActions({
  transaction,
}: {
  transaction: DashboardTransaction;
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const rerun = useMutation({
    mutationFn: async () => {
      if (!privateLedger.encryptedLedger || !privateLedger.unlocked) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const payload = {
        transactionId: transaction.transactionId,
        description: transaction.name,
        amount: Number(transaction.amount),
      };
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
      if (
        !privateLedger.userId ||
        !privateLedger.vaultId ||
        !privateLedger.keyId ||
        !masterKey
      ) {
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
    },
    onSuccess: async (result) => {
      const description = `${result.cached} reused, ${result.ai} categorized, ${result.pending} pending.`;
      if (result.ok) toast.success("Re-run complete", { description });
      else
        toast.warning("Re-run needs attention", {
          description: result.error ?? description,
        });
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

  const remove = useMutation({
    mutationFn: async () => {
      if (!privateLedger.vaultId || !getVaultMasterKey()) {
        throw new Error("Unlock your private ledger to delete.");
      }
      const result = await deletePrivateRecords(
        client as unknown as MutationClient,
        {
          vaultId: privateLedger.vaultId,
          recordIds: [transaction.transactionId],
        },
      );
      skipNextPrivateLedgerReload();
      privateLedger.applyLedger({
        ...privateLedger.ledger,
        transactions: privateLedger.ledger.transactions.filter(
          (row) => row.recordId !== transaction.transactionId,
        ),
      });
      return result;
    },
    onSuccess: async () => {
      setConfirmDeleteOpen(false);
      toast.success("Transaction deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  return (
    <>
      <RowActionsMenu
        label={transaction.name}
        size="md"
        actions={[
          {
            label: rerun.isPending ? "Re-running..." : "Re-run",
            onSelect: () => rerun.mutate(),
            disabled: rerun.isPending,
          },
          {
            label: "Edit",
            onSelect: () => setEditOpen(true),
          },
          {
            label: "Delete",
            onSelect: () => setConfirmDeleteOpen(true),
            variant: "destructive",
            disabled: remove.isPending,
          },
        ]}
      />
      <EditDescriptionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        currentDescription={transaction.name}
        currentSection={transaction.sectionName}
        currentCategory={transaction.categoryName}
        currentSubcategory={transaction.subcategoryName}
      />
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              Delete this transaction?
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:text-primary"
                    aria-label="About deleting this transaction"
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
                    <PopoverTitle>Delete this transaction</PopoverTitle>
                    <PopoverDescription>
                      Removes this row from your encrypted ledger.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li className="break-all">{transaction.name}</li>
                      <li>This cannot be undone</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Removes {transaction.name} from your ledger. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
