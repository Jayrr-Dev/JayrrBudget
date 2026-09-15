"use client";

import { Icon } from "@iconify/react";
import { useConvex } from "convex/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { applyVaultCategorization } from "@/domains/vault/application/applyVaultCategorization";
import { deleteVaultStatement } from "@/domains/vault/application/deleteVaultStatement";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import {
  deleteStatementUploadRequest,
  fetchStatementUpload,
} from "@/domains/statements/queries/fetchStatementUploads";
import { statementQueryKeys } from "@/domains/statements/queries/query-keys";
import { OcrMarkdownView } from "@/domains/statements/ui/OcrMarkdownView";

/**
 * Row menu for a parse log. Delete removes the upload and its ledger children.
 */
export function StatementUploadRowActions({
  upload,
}: {
  upload: StatementUploadLog;
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const vault = upload.source === "vault";
  const alreadyCategorized = upload.categorized;
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmCategorizeOpen, setConfirmCategorizeOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const categorize = useMutation({
    mutationFn: async () => {
      if (vault) {
        const txs = privateLedger.ledger.transactions.filter((tx) =>
          upload.transactionIds?.length
            ? upload.transactionIds.includes(tx.recordId)
            : tx.statementRecordId === upload.recordId,
        );
        const response = await fetch("/api/statements/categorize-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skipCache: alreadyCategorized,
            transactions: txs.map((tx) => ({
              transactionId: tx.recordId,
              description: tx.description,
              amount: tx.amount,
            })),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Categorization failed");
        const masterKey = getVaultMasterKey();
        if (!privateLedger.userId || !privateLedger.vaultId || !privateLedger.keyId || !masterKey) {
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
        return result.summary as import("../domain/importResult").CategorizationSummary;
      }
      const response = await fetch(`/api/statements/${upload.id}/categorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: alreadyCategorized }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Categorization failed");
      return result as import("../domain/importResult").CategorizationSummary;
    },
    onSuccess: async result => {
      setConfirmCategorizeOpen(false);
      const description = `${result.cached} reused, ${result.ai} categorized, ${result.pending} pending.`;
      if (result.ok) {
        toast.success(alreadyCategorized ? "Recategorization complete" : "Categorization complete", {
          description,
        });
      } else {
        toast.warning(
          alreadyCategorized ? "Recategorization needs attention" : "Categorization needs attention",
          { description: result.error ?? description },
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statementQueryKeys.uploads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: error => toast.error(
      alreadyCategorized ? "Recategorization failed" : "Categorization failed",
      { description: error.message },
    ),
  });
  const detail = useQuery({
    queryKey: statementQueryKeys.upload(upload.id),
    queryFn: () => fetchStatementUpload(upload.id),
    enabled: ocrOpen && upload.hasOcr && !vault,
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (vault) {
        const masterKey = getVaultMasterKey();
        if (!privateLedger.userId || !privateLedger.vaultId || !privateLedger.keyId || !masterKey || !upload.recordId) {
          throw new Error("Sign in again, then delete.");
        }
        return deleteVaultStatement({
          client: client as unknown as MutationClient,
          userId: privateLedger.userId,
          vaultId: privateLedger.vaultId,
          keyId: privateLedger.keyId,
          masterKey,
          ledger: privateLedger.ledger,
          statementRecordId: upload.recordId,
        });
      }
      return deleteStatementUploadRequest(upload.id);
    },
    onSuccess: async (result) => {
      setConfirmDeleteOpen(false);
      toast.success("Statement deleted", {
        description: `${result.filename}: ${result.deletedTransactions} transactions removed.`,
        id: `statement-delete-${upload.id}`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statementQueryKeys.uploads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
      if (vault) privateLedger.reload();
      queryClient.removeQueries({
        queryKey: statementQueryKeys.upload(upload.id),
      });
    },
    onError: (error) => {
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : String(error),
        id: `statement-delete-${upload.id}`,
      });
    },
  });

  const categorizeLabel = categorize.isPending
    ? alreadyCategorized
      ? "Recategorizing..."
      : "Categorizing..."
    : alreadyCategorized
      ? "Recategorize?"
      : "Categorize transactions";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label={`Actions for ${upload.filename}`}
        >
          <Icon icon="basil:menu-outline" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          <DropdownMenuItem
            disabled={categorize.isPending || remove.isPending}
            onClick={() => setConfirmCategorizeOpen(true)}
          >
            {categorizeLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={!upload.hasOcr}
            onClick={() => {
              window.setTimeout(() => setOcrOpen(true), 0);
            }}
          >
            View OCR
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            disabled={remove.isPending || (vault && upload.recordId === "statement-inferred")}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {upload.filename}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="About OCR"
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
                    <PopoverTitle>Encrypted statement scan</PopoverTitle>
                    <PopoverDescription className="leading-relaxed">
                      This scan is encrypted. Only you can read it.
                    </PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Private scan from this statement.
            </DialogDescription>
          </DialogHeader>
          {vault ? (
            upload.ocrMarkdown?.trim() ? (
              <OcrMarkdownView markdown={upload.ocrMarkdown} />
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                No scan saved for this statement. Upload it again to keep a copy.
              </p>
            )
          ) : detail.isPending ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : detail.isError ? (
            <p className="text-sm text-red-700">{detail.error.message}</p>
          ) : (
            <OcrMarkdownView markdown={detail.data?.upload.ocrMarkdown ?? ""} />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmCategorizeOpen} onOpenChange={setConfirmCategorizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {alreadyCategorized ? "Recategorize this statement?" : "Categorize this statement?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alreadyCategorized
                ? `Re-labels transactions from ${upload.filename} using your current upload rules. Existing categories can change.`
                : `Labels transactions from ${upload.filename} using your upload rules.`}
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
              disabled={categorize.isPending}
              onClick={() => categorize.mutate()}
            >
              {categorize.isPending
                ? alreadyCategorized
                  ? "Recategorizing…"
                  : "Categorizing…"
                : alreadyCategorized
                  ? "Recategorize"
                  : "Categorize"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this statement?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {upload.filename} and every transaction parsed from it.
              This cannot be undone.
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
