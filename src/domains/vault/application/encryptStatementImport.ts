import type { ImportBankStatementSuccess } from "@/domains/statements/domain/importResult";
import type { MutationClient, PrivateRecordInput } from "@/crypto/vaultRecords";
import { savePrivateRecords } from "@/crypto/vaultRecords";

/** Encrypt Cloud Processing parse results into the private vault. */
export async function encryptStatementImportToVault(input: {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  result: ImportBankStatementSuccess;
}) {
  const payload = input.result.vaultPayload;
  if (!payload) throw new Error("Statement parse did not return vault payload.");

  const records: PrivateRecordInput[] = [
    {
      recordId: `account-${payload.accountId}`,
      kind: "account_meta",
      value: {
        accountId: payload.accountId,
        name: payload.accountName ?? payload.accountId,
        officialName: payload.accountName,
        mask: payload.accountMask,
        type: payload.accountType,
        subtype: payload.accountSubtype,
        currentBalance: payload.closingBalance,
        availableBalance: null,
        isoCurrencyCode: payload.currency,
      },
      expectedRevision: null,
    },
    ...payload.transactions.map((txn) => ({
      recordId: txn.transactionId,
      kind: "tx" as const,
      value: {
        date: txn.posted,
        description: txn.description,
        amount: txn.amount,
        currency: payload.currency,
        accountId: payload.accountId,
        pending: txn.pending,
        tagNames: [] as string[],
      },
      expectedRevision: null,
    })),
  ];

  await savePrivateRecords(input.client, {
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    masterKey: input.masterKey,
    records,
  });
}
