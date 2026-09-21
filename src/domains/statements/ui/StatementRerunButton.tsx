"use client";

import { getVaultMasterKey } from "@/crypto/session";
import { deletePrivateRecords, type MutationClient } from "@/crypto/vaultRecords";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import { describeImportResult } from "@/domains/statements/domain/importCopy";
import type { StatementUploadLog } from "@/domains/statements/domain/types";
import { statementQueryKeys } from "@/domains/statements/queries/query-keys";
import { uploadBankStatement } from "@/domains/statements/queries/uploadBankStatement";
import { encryptStatementImportToVault } from "@/domains/vault/application/encryptStatementImport";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import {
  loadPrivateLedger,
  type VaultListClient,
} from "@/domains/vault/application/loadPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function canRerunStatement(upload: StatementUploadLog) {
  return (
    upload.source === "vault" &&
    upload.balanceOk === false &&
    Boolean(upload.ocrMarkdown?.trim()) &&
    /^[a-f0-9]{64}$/i.test(upload.fileHash?.trim() ?? "")
  );
}

export function StatementRerunButton({ upload }: { upload: StatementUploadLog }) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const rerun = useMutation({
    mutationFn: async () => {
      const markdown = upload.ocrMarkdown?.trim() ?? "";
      const fileHash = upload.fileHash?.trim() ?? "";
      if (!markdown || !fileHash) {
        throw new Error("No saved scan to rerun.");
      }
      const file = new File([new Uint8Array([0])], upload.filename || "statement.pdf", {
        type: "application/pdf",
      });
      const result = await uploadBankStatement(file, {
        savedOcr: {
          markdown,
          pageCount: upload.pageCount && upload.pageCount > 0 ? upload.pageCount : 1,
          fileHash,
        },
      });
      const opened = await hydrateVaultSession(client as unknown as VaultClient);
      const masterKey = getVaultMasterKey();
      const vaultId = privateLedger.vaultId ?? opened?.vaultId ?? null;
      const keyId = privateLedger.keyId ?? opened?.keyId ?? null;
      if (!privateLedger.userId || !vaultId || !keyId || !masterKey) {
        throw new Error("Sign in again, then rerun.");
      }
      const ledger = await loadPrivateLedger(client as unknown as VaultListClient, {
        userId: privateLedger.userId,
        vaultId,
      });
      await encryptStatementImportToVault({
        client: client as unknown as MutationClient,
        userId: privateLedger.userId,
        vaultId,
        keyId,
        masterKey,
        result,
        ledger,
      });
      const kept = new Set(
        result.vaultPayload?.transactions.map((txn) => txn.transactionId) ?? [],
      );
      const statementRecordId = `statement-${fileHash}`;
      const stale = ledger.transactions
        .filter(
          (tx) =>
            tx.statementRecordId === statementRecordId ||
            (upload.transactionIds ?? []).includes(tx.recordId),
        )
        .map((tx) => tx.recordId)
        .filter((id) => !kept.has(id));
      if (stale.length > 0) {
        await deletePrivateRecords(client as unknown as MutationClient, {
          vaultId,
          recordIds: stale,
        });
      }
      return result;
    },
    onSuccess: async (result) => {
      privateLedger.reload();
      const copy = describeImportResult(result);
      const toastId = `statement-rerun-${upload.id}`;
      if (copy.tone === "warning") {
        toast.warning(copy.title, { description: copy.description, id: toastId });
      } else {
        toast.success(copy.title, { description: copy.description, id: toastId });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statementQueryKeys.uploads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error("Rerun failed", {
        description: error instanceof Error ? error.message : String(error),
        id: `statement-rerun-${upload.id}`,
      });
    },
  });

  if (!canRerunStatement(upload)) return null;

  return (
    <button
      type="button"
      className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-wait"
      aria-label={`Rerun ${upload.filename}`}
      title="Rerun"
      disabled={rerun.isPending}
      onClick={() => rerun.mutate()}
    >
      <RefreshCw className={rerun.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
    </button>
  );
}
