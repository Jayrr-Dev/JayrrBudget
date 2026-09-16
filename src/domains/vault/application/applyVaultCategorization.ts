import { toSlug } from "@/domains/enrichment/domain/slug";
import type { MutationClient } from "@/crypto/vaultRecords";
import { savePrivateRecords } from "@/crypto/vaultRecords";
import type { LabeledTransaction } from "@/domains/statements/application/categorizeStatement";
import type { PrivateLedger, PrivateTransaction } from "@/domains/vault/domain/privateLedger";

function labeledTxValue(tx: PrivateTransaction, label: LabeledTransaction) {
  return {
    date: tx.date,
    authorizedDate: tx.authorizedDate ?? null,
    description: tx.description,
    amount: tx.amount,
    currency: tx.currency,
    accountId: tx.accountId ?? null,
    pending: Boolean(tx.pending),
    city: tx.city ?? null,
    region: tx.region ?? null,
    country: tx.country ?? null,
    merchantName: label.profile.merchant,
    merchantClean: label.profile.merchant,
    sectionName: label.section,
    categoryName: label.category,
    subcategoryName: label.subcategory,
    spreadName: label.profile.spread,
    transactionTypeName: label.profile.transactionType,
    txnCode: label.profile.txnCode,
    channel: label.profile.channel,
    statementRecordId: tx.statementRecordId ?? null,
    source: tx.source ?? "statement",
    tagNames: [
      ...new Set([
        ...(tx.tagNames ?? []),
        ...(label.profile.tags ?? []),
      ]),
    ],
  };
}

export async function applyVaultCategorization(input: {
  client: MutationClient;
  userId: string;
  vaultId: string;
  keyId: string;
  masterKey: CryptoKey;
  ledger: PrivateLedger;
  labeled: LabeledTransaction[];
}) {
  const records = [];
  const merchants = new Map<string, string>();
  for (const label of input.labeled) {
    const tx = input.ledger.transactions.find((row) => row.recordId === label.transactionId);
    if (!tx) continue;
    records.push({
      recordId: tx.recordId,
      kind: "tx" as const,
      value: labeledTxValue(tx, label),
      expectedRevision: tx.revision,
    });
    const name = label.profile.merchant.trim();
    if (name) merchants.set(toSlug(name) || name, name);
  }
  for (const [merchantId, name] of merchants) {
    const existing = input.ledger.merchants.find((row) => row.merchantId === merchantId);
    records.push({
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
    });
  }
  if (!records.length) return;
  await savePrivateRecords(input.client, {
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    masterKey: input.masterKey,
    records,
  });
}
