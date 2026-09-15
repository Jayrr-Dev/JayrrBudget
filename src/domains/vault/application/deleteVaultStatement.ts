import type { MutationClient } from "@/crypto/vaultRecords";
import { deletePrivateRecords } from "@/crypto/vaultRecords";
import { toSlug } from "@/domains/enrichment/domain/slug";
import type { PrivateLedger, PrivateTransaction } from "@/domains/vault/domain/privateLedger";

function merchantKey(tx: PrivateTransaction) {
  const name = (tx.merchantClean ?? tx.merchantName ?? "").trim();
  if (!name) return null;
  return toSlug(name) || name;
}

export async function deleteVaultStatement(input: {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  ledger: PrivateLedger;
  statementRecordId: string;
}) {
  const log = input.ledger.statementLogs.find((row) => row.recordId === input.statementRecordId);
  if (!log || log.recordId === "statement-inferred") {
    throw new Error("That encrypted statement log cannot be deleted.");
  }

  const fromLog = new Set(log.transactionIds ?? []);
  const transactionIds = [
    ...new Set([
      ...fromLog,
      ...input.ledger.transactions
        .filter((tx) => tx.statementRecordId === log.recordId || fromLog.has(tx.recordId))
        .map((tx) => tx.recordId),
    ]),
  ];

  const remainingTxs = input.ledger.transactions.filter(
    (tx) => !transactionIds.includes(tx.recordId),
  );
  const remainingAccountIds = new Set(
    remainingTxs.map((tx) => tx.accountId).filter((id): id is string => Boolean(id)),
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

  const ocrIds = [
    log.ocrRecordId,
    log.fileHash ? `ocr-${log.fileHash}` : null,
  ].filter((id): id is string => Boolean(id));

  const recordIds = [
    ...transactionIds,
    ...orphanAccounts.map((account) => account.recordId),
    ...orphanMerchants.map((merchant) => merchant.recordId),
    log.recordId,
    ...ocrIds,
  ];

  await deletePrivateRecords(input.client, {
    vaultId: input.vaultId,
    recordIds,
  });

  return { filename: log.filename, deletedTransactions: transactionIds.length };
}
