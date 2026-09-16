import { getVaultMasterKey } from "@/crypto/session";
import {
  savePrivateRecords,
  type MutationClient,
  type PrivateRecordInput,
} from "@/crypto/vaultRecords";
import type { PrivateTransaction } from "@/domains/vault/domain/privateLedger";
import { api } from "@convex/_generated/api";
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

function encryptedTxValue(
  tx: Omit<PrivateTransaction, "recordId" | "revision">,
) {
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
  await saveEncryptedRecords(ctx, [
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
