import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import type { ImportStatementDocumentOutput } from "@/domains/ledger-ai/domain/importStatementDocumentTool";
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
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import type { ConvexReactClient } from "convex/react";

export async function importStatementFromChat(options: {
  file: File;
  persistMode: "convex" | "vault";
  cloudProcessing: boolean;
  convex: ConvexReactClient;
  userId: string | null;
  vaultId: string | null;
  keyId: string | null;
  ledger?: PrivateLedger;
}): Promise<ImportStatementDocumentOutput> {
  if (options.persistMode === "vault" && !options.cloudProcessing) {
    return {
      ok: false,
      error:
        "Turn on Cloud Processing in Modules before importing a statement.",
    };
  }

  try {
    const result = await uploadBankStatement(options.file, {
      persistMode: options.persistMode,
    });

    if (options.persistMode === "vault") {
      const opened = await hydrateVaultSession(
        options.convex as unknown as VaultClient,
      );
      const masterKey = getVaultMasterKey();
      const vaultId = options.vaultId ?? opened?.vaultId ?? null;
      const keyId = options.keyId ?? opened?.keyId ?? null;
      if (!options.userId || !vaultId || !keyId || !masterKey) {
        return {
          ok: false,
          error: "Unlock the vault, then ask Jev to import again.",
        };
      }
      const ledger =
        options.ledger ??
        (await loadPrivateLedger(options.convex as unknown as VaultListClient, {
          userId: options.userId,
          vaultId,
        }));
      await encryptStatementImportToVault({
        client: options.convex as unknown as MutationClient,
        userId: options.userId,
        vaultId,
        keyId,
        masterKey,
        result,
        ledger,
      });
    }

    return {
      ok: true,
      filename: result.filename,
      duplicateFile: result.duplicateFile,
      institutionName: result.institutionName,
      accountName: result.accountName,
      statementPeriodStart: result.statementPeriodStart,
      statementPeriodEnd: result.statementPeriodEnd,
      transactionCount: result.transactionCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      balanceOk: result.balanceOk,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not import the statement"),
    };
  }
}
