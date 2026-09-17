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
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import { OcrMarkdownView } from "@/domains/statements/ui/OcrMarkdownView";
import { deleteVaultLoan } from "@/domains/vault/application/deleteVaultLoan";
import {
  skipNextPrivateLedgerReload,
  usePrivateLedger,
} from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  accountId: string;
  accountName: string;
};

export function LoanAccountActions({ accountId, accountName }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const [ocrOpen, setOcrOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const vaultDoc = privateLedger.encryptedLedger
    ? privateLedger.ledger.loanDocuments
        .filter((doc) => doc.accountId === accountId && doc.ocrMarkdown?.trim())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : null;
  const convexDoc = useQuery(
    api.loanDocuments.getByAccountId,
    privateLedger.encryptedLedger ? "skip" : { accountId },
  );

  const filename = vaultDoc?.filename ?? convexDoc?.filename ?? "Loan document";
  const markdown = vaultDoc?.ocrMarkdown ?? convexDoc?.ocrMarkdown ?? "";
  const hasOcr = markdown.trim().length > 0 || Boolean(convexDoc?.hasOcr);
  const ocrLoading = !vaultDoc && convexDoc === undefined;
  const canDelete = Boolean(
    privateLedger.encryptedLedger &&
    privateLedger.userId &&
    privateLedger.vaultId &&
    getVaultMasterKey(),
  );

  const remove = useMutation({
    mutationFn: async () => {
      if (
        !privateLedger.userId ||
        !privateLedger.vaultId ||
        !getVaultMasterKey()
      ) {
        throw new Error("Unlock the vault to delete this lending account.");
      }
      const result = await deleteVaultLoan({
        client: client as unknown as MutationClient,
        vaultId: privateLedger.vaultId,
        accountId,
        ledger: privateLedger.ledger,
      });
      skipNextPrivateLedgerReload();
      privateLedger.applyLedger(result.nextLedger);
      return result;
    },
    onSuccess: async () => {
      setConfirmDeleteOpen(false);
      toast.success("Lending account deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
      router.replace("/accounts");
    },
    onError: (error) => {
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return (
    <>
      <RowActionsMenu
        label={accountName}
        size="sm"
        actions={[
          {
            label: "View OCR",
            onSelect: () => setOcrOpen(true),
            disabled: !hasOcr || ocrLoading,
          },
          {
            label: "Delete",
            onSelect: () => setConfirmDeleteOpen(true),
            variant: "destructive",
            disabled: !canDelete || remove.isPending,
          },
        ]}
      />
      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {filename}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
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
                    <PopoverTitle>Encrypted loan scan</PopoverTitle>
                    <PopoverDescription className="leading-relaxed">
                      This scan is encrypted with your other financial data.
                      Only you can read it.
                    </PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Private OCR scan from the uploaded loan document.
            </DialogDescription>
          </DialogHeader>
          {markdown.trim() ? (
            <OcrMarkdownView markdown={markdown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No scan text available.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              Delete this lending account?
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="About deleting this lending account"
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
                    <PopoverTitle>Delete this lending account</PopoverTitle>
                    <PopoverDescription>
                      Removes the loan terms and the uploaded scan.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li className="break-all">{accountName}</li>
                      <li>Bank payments stay in your ledger</li>
                      <li>This cannot be undone</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Removes {accountName} and its loan scan. Bank payments stay. This
              cannot be undone.
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
