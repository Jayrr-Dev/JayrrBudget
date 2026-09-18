import type { MutationClient, PrivateRecordInput } from "@/crypto/vaultRecords";
import { savePrivateRecords } from "@/crypto/vaultRecords";
import { toSlug } from "@/domains/enrichment/domain/slug";
import type { ImportBankStatementSuccess } from "@/domains/statements/domain/importResult";
import { isPlaceholderManualAccountId } from "@/domains/statements/domain/parsedStatement";
import { resolveImportAccountId } from "@/domains/vault/application/mergePlaceholderAccounts";
import { encryptedAccountMetaValue } from "@/domains/vault/application/saveEncryptedLedger";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

function txValue(
  txn: NonNullable<
    ImportBankStatementSuccess["vaultPayload"]
  >["transactions"][number],
  input: {
    currency: string;
    accountId: string;
    statementRecordId: string;
    tagNames: string[];
  },
) {
  return {
    date: txn.posted,
    authorizedDate: txn.authorized,
    description: txn.description,
    amount: txn.amount,
    currency: input.currency,
    foreignAmount: txn.foreignAmount ?? null,
    foreignCurrency: txn.foreignCurrency ?? null,
    exchangeRate: txn.exchangeRate ?? null,
    accountId: input.accountId,
    pending: txn.pending,
    city: txn.city,
    region: txn.region,
    country: txn.country,
    merchantName: txn.merchantClean ?? null,
    merchantClean: txn.merchantClean ?? null,
    sectionName: txn.sectionName ?? null,
    categoryName: txn.categoryName ?? null,
    subcategoryName: txn.subcategoryName ?? null,
    spreadName: txn.spreadName ?? null,
    transactionTypeName: txn.transactionTypeName ?? null,
    txnCode: txn.txnCode ?? null,
    channel: txn.channel ?? null,
    statementRecordId: input.statementRecordId,
    source: "statement",
    tagNames: input.tagNames,
  };
}

/** Encrypt Cloud Processing parse results before they are stored. */
export async function encryptStatementImportToVault(input: {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  result: ImportBankStatementSuccess;
  ledger?: PrivateLedger;
}) {
  const payload = input.result.vaultPayload;
  if (!payload)
    throw new Error("Statement parse did not return vault payload.");

  const accountId = resolveImportAccountId(input.ledger?.accounts, payload);
  const accountRecordId = `account-${accountId}`;
  const existingAccount = input.ledger?.accounts.find(
    (account) =>
      account.recordId === accountRecordId || account.accountId === accountId,
  );
  const keepExistingIdentity = Boolean(
    existingAccount && !isPlaceholderManualAccountId(existingAccount.accountId),
  );
  const parsedMask = payload.accountMask?.replace(/\D/g, "").slice(-4) || null;
  const keepMask =
    parsedMask && parsedMask !== "xxxx"
      ? parsedMask
      : (existingAccount?.mask ?? parsedMask);
  const fileHash = input.result.fileHash?.trim() || `import-${Date.now()}`;
  const statementRecordId = `statement-${fileHash}`;
  const ocrRecordId = `ocr-${fileHash}`;
  const existingLog = input.ledger?.statementLogs.find(
    (log) => log.fileHash && log.fileHash === fileHash,
  );
  const now = new Date().toISOString();
  const transactionIds = payload.transactions.map((txn) => txn.transactionId);

  const merchants = new Map<string, string>();
  for (const txn of payload.transactions) {
    const name = txn.merchantClean?.trim();
    if (!name) continue;
    merchants.set(toSlug(name) || name, name);
  }

  const records: PrivateRecordInput[] = [
    {
      recordId: accountRecordId,
      kind: "account_meta",
      value: encryptedAccountMetaValue({
        accountId,
        name: keepExistingIdentity
          ? (existingAccount?.name ?? accountId)
          : (payload.accountName ?? existingAccount?.name ?? accountId),
        label: existingAccount?.label ?? null,
        officialName: keepExistingIdentity
          ? (existingAccount?.officialName ?? payload.accountName)
          : (payload.accountName ?? existingAccount?.officialName ?? null),
        mask: keepMask,
        type: existingAccount?.type ?? payload.accountType,
        subtype: existingAccount?.subtype ?? payload.accountSubtype,
        currentBalance: payload.closingBalance,
        availableBalance: existingAccount?.availableBalance ?? null,
        isoCurrencyCode: payload.currency,
      }),
      expectedRevision: existingAccount?.revision ?? null,
    },
    ...payload.transactions.map((txn) => {
      const existing = input.ledger?.transactions.find(
        (row) => row.recordId === txn.transactionId,
      );
      return {
        recordId: txn.transactionId,
        kind: "tx" as const,
        value: txValue(txn, {
          currency: payload.currency,
          accountId,
          statementRecordId,
          tagNames: txn.tagNames ?? existing?.tagNames ?? [],
        }),
        expectedRevision: existing?.revision ?? null,
      };
    }),
    ...[...merchants.entries()].map(([merchantId, name]) => {
      const existing = input.ledger?.merchants.find(
        (row) => row.merchantId === merchantId,
      );
      return {
        recordId: `merchant-${merchantId}`,
        kind: "note" as const,
        value: {
          merchantId,
          name,
          rawName: existing?.rawName ?? name,
          company: existing?.company ?? null,
          brand: existing?.brand ?? null,
          website: existing?.website ?? null,
          logoUrl: existing?.logoUrl ?? null,
        },
        expectedRevision: existing?.revision ?? null,
      };
    }),
    {
      recordId: statementRecordId,
      kind: "document",
      value: {
        type: "statement_import",
        filename: input.result.filename ?? "statement.pdf",
        fileHash,
        status: "completed",
        institutionName: input.result.institutionName,
        accountName: input.result.accountName,
        accountMask: payload.accountMask,
        currency: payload.currency,
        pageCount: input.result.pageCount,
        transactionCount: input.result.transactionCount,
        insertedCount: input.result.insertedCount,
        updatedCount: input.result.updatedCount,
        skippedCount: input.result.skippedCount,
        statementPeriodStart: input.result.statementPeriodStart,
        statementPeriodEnd: input.result.statementPeriodEnd,
        openingBalance: input.result.openingBalance,
        closingBalance: input.result.closingBalance,
        transactionSum: input.result.transactionSum,
        computedClosing: input.result.computedClosing,
        balanceDelta: input.result.balanceDelta,
        balanceOk: input.result.balanceOk,
        createdAt: existingLog?.createdAt ?? now,
        ocrRecordId,
        transactionIds,
      },
      expectedRevision:
        existingLog && existingLog.recordId !== "statement-inferred"
          ? existingLog.revision
          : null,
    },
    {
      recordId: ocrRecordId,
      kind: "document",
      value: {
        type: "statement_ocr",
        statementRecordId,
        fileHash,
        filename: input.result.filename ?? "statement.pdf",
        ocrMarkdown: payload.ocrMarkdown ?? "",
      },
      expectedRevision: existingLog?.ocrRevision ?? null,
    },
  ];

  await savePrivateRecords(input.client, {
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    masterKey: input.masterKey,
    records,
  });
}
