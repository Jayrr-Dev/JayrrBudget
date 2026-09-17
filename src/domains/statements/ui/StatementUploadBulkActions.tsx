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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import type { CategorizationSummary } from "@/domains/statements/domain/importResult";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import { statementQueryKeys } from "@/domains/statements/queries/query-keys";
import { applyVaultCategorization } from "@/domains/vault/application/applyVaultCategorization";
import { deleteVaultStatements } from "@/domains/vault/application/deleteVaultStatement";
import {
  skipNextPrivateLedgerReload,
  usePrivateLedger,
} from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { Icon } from "@iconify/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function isDeletableUpload(upload: StatementUploadLog) {
  return upload.recordId !== "statement-inferred";
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

/**
 * Header menu for parse logs currently on the page.
 */
export function StatementUploadBulkActions({
  uploads,
}: {
  uploads: StatementUploadLog[];
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const deletable = uploads.filter(isDeletableUpload);
  const alreadyCategorized = uploads.some((upload) => upload.categorized);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmCategorizeOpen, setConfirmCategorizeOpen] = useState(false);

  const invalidateLedger = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: statementQueryKeys.uploads }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
    ]);
  };

  const categorize = useMutation({
    mutationFn: async (visible: StatementUploadLog[]) => {
      const vaultUploads = visible.filter(
        (upload) => upload.source === "vault",
      );
      const convexUploads = visible.filter(
        (upload) => upload.source !== "vault",
      );
      let summary = emptySummary();

      if (vaultUploads.length > 0) {
        const txs = privateLedger.ledger.transactions.filter((tx) =>
          vaultUploads.some((upload) =>
            upload.transactionIds?.length
              ? upload.transactionIds.includes(tx.recordId)
              : tx.statementRecordId === upload.recordId,
          ),
        );
        const recategorize = vaultUploads.some((upload) => upload.categorized);
        const response = await fetch("/api/statements/categorize-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skipCache: recategorize,
            transactions: txs.map((tx) => ({
              transactionId: tx.recordId,
              description: tx.description,
              amount: tx.amount,
            })),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Categorization failed");
        }
        const masterKey = getVaultMasterKey();
        if (
          !privateLedger.userId ||
          !privateLedger.vaultId ||
          !privateLedger.keyId ||
          !masterKey
        ) {
          throw new Error("Sign in again, then categorize.");
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
        summary = addSummaries(
          summary,
          result.summary as CategorizationSummary,
        );
      }

      for (const upload of convexUploads) {
        const response = await fetch(
          `/api/statements/${upload.id}/categorize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force: upload.categorized }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Categorization failed");
        }
        summary = addSummaries(summary, result as CategorizationSummary);
      }

      return summary;
    },
    onSuccess: async (result) => {
      setConfirmCategorizeOpen(false);
      const description = `${result.cached} reused, ${result.ai} categorized, ${result.pending} pending.`;
      if (result.ok) {
        toast.success(
          alreadyCategorized
            ? "Recategorization complete"
            : "Categorization complete",
          { description, id: "statement-bulk-categorize" },
        );
      } else {
        toast.warning(
          alreadyCategorized
            ? "Recategorization needs attention"
            : "Categorization needs attention",
          {
            description: result.error ?? description,
            id: "statement-bulk-categorize",
          },
        );
      }
      await invalidateLedger();
    },
    onError: (error) =>
      toast.error(
        alreadyCategorized
          ? "Recategorization failed"
          : "Categorization failed",
        {
          description: error instanceof Error ? error.message : String(error),
          id: "statement-bulk-categorize",
        },
      ),
  });

  const removeBulk = useMutation({
    mutationFn: async (visible: StatementUploadLog[]) => {
      const vaultUploads = visible.filter(
        (upload) => upload.source === "vault",
      );
      const convexUploads = visible.filter(
        (upload) => upload.source !== "vault",
      );
      let deletedTransactions = 0;
      const filenames: string[] = [];

      if (vaultUploads.length > 0) {
        const masterKey = getVaultMasterKey();
        const recordIds = vaultUploads
          .map((upload) => upload.recordId)
          .filter((id): id is string => Boolean(id));
        if (
          !privateLedger.userId ||
          !privateLedger.vaultId ||
          !privateLedger.keyId ||
          !masterKey
        ) {
          throw new Error("Sign in again, then delete.");
        }
        const vaultResult = await deleteVaultStatements({
          client: client as unknown as MutationClient,
          userId: privateLedger.userId,
          vaultId: privateLedger.vaultId,
          keyId: privateLedger.keyId,
          masterKey,
          ledger: privateLedger.ledger,
          statementRecordIds: recordIds,
        });
        skipNextPrivateLedgerReload();
        privateLedger.applyLedger(vaultResult.nextLedger);
        deletedTransactions += vaultResult.deletedTransactions;
        filenames.push(...vaultResult.filenames);
      }

      for (const upload of convexUploads) {
        const result = await client.mutation(api.statements.remove, {
          uploadId: upload.id,
        });
        if (!result.ok) throw new Error(result.error);
        deletedTransactions += result.deletedTransactions;
        filenames.push(result.filename);
      }

      return { count: filenames.length, deletedTransactions };
    },
    onSuccess: async (result) => {
      setConfirmDeleteOpen(false);
      toast.success(
        result.count === 1
          ? "Statement deleted"
          : `${result.count} statements deleted`,
        {
          description: `${result.deletedTransactions} transactions removed.`,
          id: "statement-bulk-delete",
        },
      );
      await invalidateLedger();
    },
    onError: (error) => {
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : String(error),
        id: "statement-bulk-delete",
      });
    },
  });

  const busy = categorize.isPending || removeBulk.isPending;
  const categorizeLabel = categorize.isPending
    ? alreadyCategorized
      ? "Recategorizing…"
      : "Categorizing…"
    : alreadyCategorized
      ? "Recategorize visible?"
      : "Categorize visible";

  return (
    <>
      <span className="flex items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Actions for visible statements"
            title="Actions for visible statements"
            disabled={uploads.length === 0 || busy}
          >
            <Icon
              icon="mynaui:mouse-pointer-click-solid"
              className="size-4"
              aria-hidden
            />
            <span className="sr-only">Actions for visible statements</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-44">
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={busy || uploads.length === 0}
              onClick={() => setConfirmCategorizeOpen(true)}
            >
              {categorizeLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              disabled={busy || deletable.length === 0}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete visible
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <AlertDialog
        open={confirmCategorizeOpen}
        onOpenChange={(open) => {
          if (categorize.isPending) return;
          setConfirmCategorizeOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {alreadyCategorized
                ? "Recategorize visible statements?"
                : "Categorize visible statements?"}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="About categorizing visible statements"
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
                    <PopoverTitle>
                      {alreadyCategorized
                        ? "Recategorize visible"
                        : "Categorize visible"}
                    </PopoverTitle>
                    <PopoverDescription>
                      Labels transactions on the current page with your upload
                      rules.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Uses the current filter and page, not every file</li>
                      <li>
                        {alreadyCategorized
                          ? "Existing categories can change"
                          : "Only unlabeled transactions get new labels"}
                      </li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              {alreadyCategorized
                ? `Re-labels transactions from ${uploads.length} visible statements.`
                : `Labels transactions from ${uploads.length} visible statements.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={categorize.isPending}
              onClick={() => setConfirmCategorizeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={categorize.isPending || uploads.length === 0}
              onClick={() => categorize.mutate(uploads)}
            >
              {categorize.isPending
                ? alreadyCategorized
                  ? "Recategorizing…"
                  : "Categorizing…"
                : alreadyCategorized
                  ? `Recategorize ${uploads.length}`
                  : `Categorize ${uploads.length}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          if (removeBulk.isPending) return;
          setConfirmDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              Delete visible statements?
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="About deleting visible statements"
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
                    <PopoverTitle>Delete visible statements</PopoverTitle>
                    <PopoverDescription>
                      Removes the parse logs currently on this page.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Uses the current filter and page, not every file</li>
                      <li>
                        Transactions parsed from those files are deleted too
                      </li>
                      <li>This cannot be undone</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Removes {deletable.length} visible parse logs and every
              transaction parsed from them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={removeBulk.isPending}
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeBulk.isPending || deletable.length === 0}
              onClick={() => removeBulk.mutate(deletable)}
            >
              {removeBulk.isPending
                ? "Deleting…"
                : `Delete ${deletable.length}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
