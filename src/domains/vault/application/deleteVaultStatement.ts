import type { MutationClient } from "@/crypto/vaultRecords";
import { deletePrivateRecords } from "@/crypto/vaultRecords";
import { toSlug } from "@/domains/enrichment/domain/slug";
import type {
  PrivateLedger,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";

function merchantKey(tx: PrivateTransaction) {
  const name = (tx.merchantClean ?? tx.merchantName ?? "").trim();
  if (!name) return null;
  return toSlug(name) || name;
}

type DeleteVaultStatementBase = {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  ledger: PrivateLedger;
};

export async function deleteVaultStatements(
  input: DeleteVaultStatementBase & { statementRecordIds: string[] },
) {
  const uniqueIds = [...new Set(input.statementRecordIds)];
  const logs = uniqueIds.map((id) => {
    const log = input.ledger.statementLogs.find((row) => row.recordId === id);
    if (!log || log.recordId === "statement-inferred") {
      throw new Error("That encrypted statement log cannot be deleted.");
    }
    return log;
  });
  if (logs.length === 0) {
    throw new Error("No statements to delete.");
  }

  const logIds = new Set(logs.map((log) => log.recordId));
  const fromLogs = new Set(logs.flatMap((log) => log.transactionIds ?? []));
  const transactionIds = [
    ...new Set([
      ...fromLogs,
      ...input.ledger.transactions
        .filter(
          (tx) =>
            (tx.statementRecordId != null &&
              logIds.has(tx.statementRecordId)) ||
            fromLogs.has(tx.recordId),
        )
        .map((tx) => tx.recordId),
    ]),
  ];

  const remainingTxs = input.ledger.transactions.filter(
    (tx) => !transactionIds.includes(tx.recordId),
  );
  const remainingAccountIds = new Set(
    remainingTxs
      .map((tx) => tx.accountId)
      .filter((id): id is string => Boolean(id)),
  );
  const remainingMerchantIds = new Set(
    remainingTxs.map(merchantKey).filter((id): id is string => Boolean(id)),
  );
  const orphanAccounts = input.ledger.accounts.filter(
    (account) => !remainingAccountIds.has(account.accountId),
  );
  const orphanMerchants = input.ledger.merchants.filter(
    (merchant) => !remainingMerchantIds.has(merchant.merchantId),
  );

  const ocrIds = logs.flatMap((log) =>
    [log.ocrRecordId, log.fileHash ? `ocr-${log.fileHash}` : null].filter(
      (id): id is string => Boolean(id),
    ),
  );

  const recordIds = [
    ...transactionIds,
    ...orphanAccounts.map((account) => account.recordId),
    ...orphanMerchants.map((merchant) => merchant.recordId),
    ...logs.map((log) => log.recordId),
    ...ocrIds,
  ];

  await deletePrivateRecords(input.client, {
    vaultId: input.vaultId,
    recordIds,
  });

  const removedLogIds = new Set(logs.map((log) => log.recordId));
  const removedAccountIds = new Set(
    orphanAccounts.map((account) => account.recordId),
  );
  const removedMerchantIds = new Set(
    orphanMerchants.map((merchant) => merchant.recordId),
  );
  const nextLedger: PrivateLedger = {
    ...input.ledger,
    transactions: remainingTxs,
    accounts: input.ledger.accounts.filter(
      (account) => !removedAccountIds.has(account.recordId),
    ),
    merchants: input.ledger.merchants.filter(
      (merchant) => !removedMerchantIds.has(merchant.recordId),
    ),
    statementLogs: input.ledger.statementLogs.filter(
      (log) => !removedLogIds.has(log.recordId),
    ),
  };

  return {
    filenames: logs.map((log) => log.filename),
    deletedTransactions: transactionIds.length,
    nextLedger,
  };
}

export async function deleteVaultStatement(
  input: DeleteVaultStatementBase & { statementRecordId: string },
) {
  const result = await deleteVaultStatements({
    ...input,
    statementRecordIds: [input.statementRecordId],
  });
  const filename = result.filenames[0];
  if (!filename) {
    throw new Error("That encrypted statement log cannot be deleted.");
  }
  return {
    filename,
    deletedTransactions: result.deletedTransactions,
    nextLedger: result.nextLedger,
  };
}
