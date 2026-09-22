import type { MutationClient, PrivateRecordInput } from "@/crypto/vaultRecords";
import { savePrivateRecords } from "@/crypto/vaultRecords";
import { toSlug } from "@/domains/enrichment/domain/slug";
import type { LabeledTransaction } from "@/domains/statements/application/categorizeStatement";
import type {
  PrivateLedger,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";

function labeledTxValue(tx: PrivateTransaction, label: LabeledTransaction) {
  return {
    date: tx.date,
    authorizedDate: tx.authorizedDate ?? null,
    description: tx.description,
    amount: tx.amount,
    currency: tx.currency,
    foreignAmount: tx.foreignAmount ?? null,
    foreignCurrency: tx.foreignCurrency ?? null,
    exchangeRate: tx.exchangeRate ?? null,
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
      ...new Set([...(tx.tagNames ?? []), ...(label.profile.tags ?? [])]),
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
  const records = new Map<
    string,
    {
      recordId: string;
      kind: "tx";
      value: ReturnType<typeof labeledTxValue>;
      expectedRevision: number;
    }
  >();
  const merchants = new Map<string, string>();
  const merchantRecords: PrivateRecordInput[] = [];
  for (const label of input.labeled) {
    const tx = input.ledger.transactions.find(
      (row) => row.recordId === label.transactionId,
    );
    if (!tx) continue;
    records.set(tx.recordId, {
      recordId: tx.recordId,
      kind: "tx",
      value: labeledTxValue(tx, label),
      expectedRevision: tx.revision,
    });
    const name = label.profile.merchant.trim();
    if (name) merchants.set(toSlug(name) || name, name);
  }
  for (const [merchantId, name] of merchants) {
    const existing = input.ledger.merchants.find(
      (row) => row.merchantId === merchantId,
    );
    if (existing) continue;
    merchantRecords.push({
      recordId: `merchant-${merchantId}`,
      kind: "note" as const,
      value: {
        merchantId,
        name,
        rawName: name,
        company: null,
        brand: null,
        website: null,
        logoUrl: null,
      },
      expectedRevision: null,
    });
  }
  const pending = [...records.values(), ...merchantRecords];
  if (!pending.length) return input.ledger;
  const saved = await savePrivateRecords(input.client, {
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    masterKey: input.masterKey,
    records: pending,
  });
  const revisionById = new Map(
    saved.revisions.map((row) => [row.recordId, row.revision]),
  );
  const byId = new Map(
    input.labeled.map((label) => [label.transactionId, label]),
  );
  return {
    ...input.ledger,
    transactions: input.ledger.transactions.map((tx) => {
      const label = byId.get(tx.recordId);
      const revision = revisionById.get(tx.recordId) ?? tx.revision;
      if (!label) return tx.revision === revision ? tx : { ...tx, revision };
      return {
        ...tx,
        revision,
        merchantName: label.profile.merchant,
        merchantClean: label.profile.merchant,
        sectionName: label.section,
        categoryName: label.category,
        subcategoryName: label.subcategory,
        spreadName: label.profile.spread,
        transactionTypeName: label.profile.transactionType,
        txnCode: label.profile.txnCode,
        channel: label.profile.channel,
      };
    }),
  };
}
