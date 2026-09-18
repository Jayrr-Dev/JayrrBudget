import { getVaultMasterKey } from "@/crypto/session";
import {
  savePrivateRecords,
  type MutationClient,
  type PrivateRecordInput,
} from "@/crypto/vaultRecords";
import { normalizeAccountLabel } from "@/domains/dashboard/domain/accountName";
import type {
  PrivateAccount,
  PrivateLedger,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";
import { api } from "@convex/_generated/api";
import { rewriteTaxonomyLabel } from "@convex/lib/seedCategoryPaths";
import type { ConvexReactClient } from "convex/react";

export type VaultWriteContext = {
  client: ConvexReactClient;
  userId: string;
  vaultId: string;
  keyId: string;
};

function requireMasterKey() {
  const key = getVaultMasterKey();
  if (!key)
    throw new Error("Sign in again so this browser can save encrypted rows.");
  return key;
}

export async function saveEncryptedRecords(
  ctx: VaultWriteContext,
  records: PrivateRecordInput[],
) {
  return savePrivateRecords(ctx.client as unknown as MutationClient, {
    userId: ctx.userId,
    vaultId: ctx.vaultId,
    keyId: ctx.keyId,
    masterKey: requireMasterKey(),
    records,
  });
}

export function encryptedAccountMetaValue(
  account: Omit<PrivateAccount, "recordId" | "revision">,
) {
  return {
    accountId: account.accountId,
    name: account.name,
    label: normalizeAccountLabel(account.label),
    officialName: account.officialName ?? null,
    mask: account.mask ?? null,
    type: account.type ?? null,
    subtype: account.subtype ?? null,
    currentBalance: account.currentBalance ?? null,
    availableBalance: account.availableBalance ?? null,
    isoCurrencyCode: account.isoCurrencyCode ?? null,
  };
}

/** Nickname only. Leaves accountId and the stored bank name unchanged. */
export async function saveEncryptedAccountLabel(
  ctx: VaultWriteContext,
  ledger: PrivateLedger,
  seed: {
    accountId: string;
    name: string;
    officialName?: string | null;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
    currentBalance?: number | null;
    availableBalance?: number | null;
    isoCurrencyCode?: string | null;
  },
  label: string | null,
): Promise<PrivateLedger> {
  const existing = ledger.accounts.find(
    (row) => row.accountId === seed.accountId,
  );
  const recordId = existing?.recordId ?? `account-${seed.accountId}`;
  const value = encryptedAccountMetaValue({
    accountId: seed.accountId,
    name: existing?.name ?? seed.name,
    label,
    officialName: existing?.officialName ?? seed.officialName ?? null,
    mask: existing?.mask ?? seed.mask ?? null,
    type: existing?.type ?? seed.type ?? null,
    subtype: existing?.subtype ?? seed.subtype ?? null,
    currentBalance: existing?.currentBalance ?? seed.currentBalance ?? null,
    availableBalance:
      existing?.availableBalance ?? seed.availableBalance ?? null,
    isoCurrencyCode: existing?.isoCurrencyCode ?? seed.isoCurrencyCode ?? null,
  });
  const saved = await saveEncryptedRecords(ctx, [
    {
      recordId,
      kind: "account_meta",
      value,
      expectedRevision: existing?.revision ?? null,
    },
  ]);
  const revision =
    saved.revisions?.find((row) => row.recordId === recordId)?.revision ??
    (existing?.revision ?? 0) + 1;
  const nextAccount: PrivateAccount = {
    recordId,
    revision,
    ...value,
  };
  return {
    ...ledger,
    accounts: existing
      ? ledger.accounts.map((row) =>
          row.accountId === seed.accountId ? nextAccount : row,
        )
      : [...ledger.accounts, nextAccount],
  };
}

export function encryptedTxValue(
  tx: Omit<PrivateTransaction, "recordId" | "revision">,
) {
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
    merchantName: tx.merchantName ?? null,
    merchantClean: tx.merchantClean ?? null,
    sectionName: tx.sectionName ?? null,
    categoryName: tx.categoryName ?? null,
    subcategoryName: tx.subcategoryName ?? null,
    spreadName: tx.spreadName ?? null,
    transactionTypeName: tx.transactionTypeName ?? null,
    txnCode: tx.txnCode ?? null,
    channel: tx.channel ?? null,
    statementRecordId: tx.statementRecordId ?? null,
    source: tx.source ?? "statement",
    tagNames: tx.tagNames ?? [],
  };
}

export async function patchEncryptedTransaction(
  ctx: VaultWriteContext,
  tx: PrivateTransaction,
  patch: Partial<Omit<PrivateTransaction, "recordId" | "revision">>,
) {
  const next = { ...tx, ...patch };
  const { recordId, revision, ...value } = next;
  await saveEncryptedRecords(ctx, [
    {
      recordId,
      kind: "tx",
      value: encryptedTxValue(value),
      expectedRevision: revision,
    },
  ]);
  return { ...next, revision: revision + 1 };
}

const RENAME_CHUNK = 40;

export type EncryptedDescriptionTaxonomy = {
  sectionName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
};

/** Rewrite every encrypted tx whose description matches `from`. */
export async function renameEncryptedDescriptions(
  ctx: VaultWriteContext,
  txs: PrivateTransaction[],
  from: string,
  to: string,
  taxonomy?: EncryptedDescriptionTaxonomy,
) {
  const matches = txs.filter((tx) => tx.description === from);
  if (matches.length === 0) throw new Error("No matching transactions.");
  const description = to.trim();
  for (let i = 0; i < matches.length; i += RENAME_CHUNK) {
    const chunk = matches.slice(i, i + RENAME_CHUNK);
    await saveEncryptedRecords(
      ctx,
      chunk.map((tx) => {
        const next = {
          ...tx,
          description,
          ...(taxonomy
            ? {
                sectionName: taxonomy.sectionName,
                categoryName: taxonomy.categoryName,
                subcategoryName: taxonomy.subcategoryName,
              }
            : {}),
        };
        const { recordId, revision, ...value } = next;
        return {
          recordId,
          kind: "tx" as const,
          value: encryptedTxValue(value),
          expectedRevision: revision,
        };
      }),
    );
  }
  return matches.length;
}

function taxonomyRewritePatch(tx: PrivateTransaction) {
  const categoryName = rewriteTaxonomyLabel("category", tx.categoryName);
  const subcategoryName = rewriteTaxonomyLabel(
    "subcategory",
    tx.subcategoryName,
  );
  const changed =
    categoryName !== (tx.categoryName ?? null) ||
    subcategoryName !== (tx.subcategoryName ?? null);
  return { categoryName, subcategoryName, changed };
}

/** Rewrite stored category/sub labels onto the shortened catalog names. */
export async function rewriteEncryptedTaxonomyLabels(
  ctx: VaultWriteContext,
  txs: PrivateTransaction[],
) {
  const matches = txs.filter((tx) => taxonomyRewritePatch(tx).changed);
  if (matches.length === 0) return 0;
  for (let i = 0; i < matches.length; i += RENAME_CHUNK) {
    const chunk = matches.slice(i, i + RENAME_CHUNK);
    await saveEncryptedRecords(
      ctx,
      chunk.map((tx) => {
        const patch = taxonomyRewritePatch(tx);
        const next = {
          ...tx,
          categoryName: patch.categoryName,
          subcategoryName: patch.subcategoryName,
        };
        const { recordId, revision, ...value } = next;
        return {
          recordId,
          kind: "tx" as const,
          value: encryptedTxValue(value),
          expectedRevision: revision,
        };
      }),
    );
  }
  return matches.length;
}

function merchantKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

/** Apply taxonomy to every encrypted tx for one payee name. */
export async function recategorizeEncryptedByMerchant(
  ctx: VaultWriteContext,
  txs: PrivateTransaction[],
  merchant: string,
  taxonomy: EncryptedDescriptionTaxonomy,
) {
  const key = merchantKey(merchant);
  if (!key) throw new Error("Merchant is required");
  const matches = txs.filter((tx) => {
    return (
      merchantKey(tx.merchantClean) === key ||
      merchantKey(tx.merchantName) === key
    );
  });
  if (matches.length === 0) throw new Error("No matching transactions.");
  for (let i = 0; i < matches.length; i += RENAME_CHUNK) {
    const chunk = matches.slice(i, i + RENAME_CHUNK);
    await saveEncryptedRecords(
      ctx,
      chunk.map((tx) => {
        const next = {
          ...tx,
          sectionName: taxonomy.sectionName,
          categoryName: taxonomy.categoryName,
          subcategoryName: taxonomy.subcategoryName,
        };
        const { recordId, revision, ...value } = next;
        return {
          recordId,
          kind: "tx" as const,
          value: encryptedTxValue(value),
          expectedRevision: revision,
        };
      }),
    );
  }
  return matches.length;
}

export async function saveEncryptedMerchant(
  ctx: VaultWriteContext,
  input: {
    merchantId: string;
    name: string;
    rawName?: string | null;
    company?: string | null;
    brand?: string | null;
    website?: string | null;
    logoUrl?: string | null;
    expectedRevision?: number | null;
  },
) {
  await saveEncryptedRecords(ctx, [
    {
      recordId: `merchant-${input.merchantId}`,
      kind: "note",
      value: {
        merchantId: input.merchantId,
        name: input.name,
        rawName: input.rawName ?? null,
        company: input.company ?? null,
        brand: input.brand ?? null,
        website: input.website ?? null,
        logoUrl: input.logoUrl ?? null,
      },
      expectedRevision: input.expectedRevision ?? null,
    },
  ]);
}

export async function saveEncryptedLoan(
  ctx: VaultWriteContext,
  input: {
    accountId: string;
    principal: number;
    annualRate: number;
    paymentAmount: number;
    firstPaymentDate: string;
    paymentCount: number;
    paymentFrequency?: string | null;
    loanType?: string | null;
    rateType?: string | null;
    vehicleLabel?: string | null;
    matchMerchantClean?: string | null;
    matchAmount?: number | null;
    expectedRevision?: number | null;
  },
) {
  await saveEncryptedRecords(ctx, [
    {
      recordId: `loan-${input.accountId}`,
      kind: "note",
      value: input,
      expectedRevision: input.expectedRevision ?? null,
    },
  ]);
}

export async function saveEncryptedNote(
  ctx: VaultWriteContext,
  input: {
    tabId: string;
    title: string;
    content: string;
    expectedRevision?: number | null;
  },
) {
  await saveEncryptedRecords(ctx, [
    {
      recordId: `note-${input.tabId}`,
      kind: "note",
      value: { tabId: input.tabId, title: input.title, content: input.content },
      expectedRevision: input.expectedRevision ?? null,
    },
  ]);
}

export async function saveEncryptedScratchPad(
  ctx: VaultWriteContext,
  input: {
    tabs: Array<{
      id: string;
      name: string;
      rows: Array<{
        id: string;
        name: string;
        spend: number;
        count: number;
        currency: string;
        parent?: string;
      }>;
    }>;
    activeId: string;
    receiveId: string;
    expectedRevision?: number | null;
  },
) {
  const saved = await saveEncryptedRecords(ctx, [
    {
      recordId: "scratch-main",
      kind: "note",
      value: {
        tabs: input.tabs,
        activeId: input.activeId,
        receiveId: input.receiveId,
      },
      expectedRevision: input.expectedRevision ?? null,
    },
  ]);
  return (
    saved.revisions?.find((row) => row.recordId === "scratch-main")?.revision ??
    null
  );
}

/** Ensure vault write context exists for encrypted edits. */
export function vaultWriteReady(input: {
  encryptedLedger: boolean;
  userId: string | null;
  vaultId: string | null;
  keyId: string | null;
  client: ConvexReactClient;
}): VaultWriteContext | null {
  if (!input.encryptedLedger || !input.userId || !input.vaultId || !input.keyId)
    return null;
  if (!getVaultMasterKey()) return null;
  return {
    client: input.client,
    userId: input.userId,
    vaultId: input.vaultId,
    keyId: input.keyId,
  };
}

export { api };
