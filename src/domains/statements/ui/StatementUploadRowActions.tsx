"use client";

import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const categorize = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/statements/${upload.id}/categorize`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Categorization failed");
      return result as import("../domain/importResult").CategorizationSummary;
    },
    onSuccess: async result => {
      const description = `${result.cached} reused, ${result.ai} categorized, ${result.pending} pending.`;
      if (result.ok) toast.success("Categorization complete", { description });
      else toast.warning("Categorization needs attention", { description: result.error ?? description });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: error => toast.error("Categorization failed", { description: error.message }),
  });
  const detail = useQuery({
    queryKey: statementQueryKeys.upload(upload.id),
    queryFn: () => fetchStatementUpload(upload.id),
    enabled: ocrOpen && upload.hasOcr,
  });
  const remove = useMutation({
    mutationFn: () => deleteStatementUploadRequest(upload.id),
    onSuccess: async (result) => {
      setConfirmOpen(false);
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
          <DropdownMenuItem disabled={categorize.isPending || remove.isPending} onClick={() => categorize.mutate()}>
            {categorize.isPending ? "Categorizing..." : "Categorize transactions"}
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
            disabled={remove.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{upload.filename}</DialogTitle>
            <DialogDescription>
              OCR markdown from Mistral for this upload.
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : detail.isError ? (
            <p className="text-sm text-red-700">{detail.error.message}</p>
          ) : (
            <OcrMarkdownView
              markdown={detail.data?.upload.ocrMarkdown ?? ""}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
              onClick={() => setConfirmOpen(false)}
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
