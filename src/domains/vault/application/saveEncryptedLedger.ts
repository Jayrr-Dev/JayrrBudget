import { api } from "@convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import { getVaultMasterKey } from "@/crypto/session";
import { savePrivateRecords, type MutationClient, type PrivateRecordInput } from "@/crypto/vaultRecords";
import type { PrivateTransaction } from "@/domains/vault/domain/privateLedger";

export type VaultWriteContext = {
  client: ConvexReactClient;
  userId: string;
  vaultId: string;
  keyId: string;
};

function requireMasterKey() {
  const key = getVaultMasterKey();
  if (!key) throw new Error("Unlock the private vault before editing encrypted rows.");
  return key;
}

export async function saveEncryptedRecords(ctx: VaultWriteContext, records: PrivateRecordInput[]) {
  return savePrivateRecords(ctx.client as unknown as MutationClient, {
    userId: ctx.userId,
    vaultId: ctx.vaultId,
    keyId: ctx.keyId,
    masterKey: requireMasterKey(),
    records,
  });
}

export async function patchEncryptedTransaction(
  ctx: VaultWriteContext,
  tx: PrivateTransaction,
  patch: Partial<Omit<PrivateTransaction, "recordId" | "revision">>,
) {
  const next = { ...tx, ...patch };
  const { recordId, revision, ...value } = next;
  await saveEncryptedRecords(ctx, [{
    recordId,
    kind: "tx",
    value: {
      date: value.date,
      description: value.description,
      amount: value.amount,
      currency: value.currency,
      accountId: value.accountId ?? null,
      merchantName: value.merchantName ?? null,
      merchantClean: value.merchantClean ?? null,
      sectionName: value.sectionName ?? null,
      categoryName: value.categoryName ?? null,
      subcategoryName: value.subcategoryName ?? null,
      spreadName: value.spreadName ?? null,
      tagNames: value.tagNames ?? [],
      pending: Boolean(value.pending),
    },
    expectedRevision: revision,
  }]);
  return { ...next, revision: revision + 1 };
}

export async function saveEncryptedMerchant(
  ctx: VaultWriteContext,
  input: { merchantId: string; name: string; rawName?: string | null; company?: string | null; brand?: string | null; website?: string | null; expectedRevision?: number | null },
) {
  await saveEncryptedRecords(ctx, [{
    recordId: `merchant-${input.merchantId}`,
    kind: "note",
    value: {
      merchantId: input.merchantId,
      name: input.name,
      rawName: input.rawName ?? null,
      company: input.company ?? null,
      brand: input.brand ?? null,
      website: input.website ?? null,
    },
    expectedRevision: input.expectedRevision ?? null,
  }]);
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
  await saveEncryptedRecords(ctx, [{
    recordId: `loan-${input.accountId}`,
    kind: "note",
    value: input,
    expectedRevision: input.expectedRevision ?? null,
  }]);
}

export async function saveEncryptedNote(
  ctx: VaultWriteContext,
  input: { tabId: string; title: string; content: string; expectedRevision?: number | null },
) {
  await saveEncryptedRecords(ctx, [{
    recordId: `note-${input.tabId}`,
    kind: "note",
    value: { tabId: input.tabId, title: input.title, content: input.content },
    expectedRevision: input.expectedRevision ?? null,
  }]);
}

export async function saveEncryptedScratchPad(
  ctx: VaultWriteContext,
  input: {
    tabs: Array<{ id: string; name: string; rows: Array<{ id: string; name: string; spend: number; count: number; currency: string; parent?: string }> }>;
    activeId: string;
    receiveId: string;
    expectedRevision?: number | null;
  },
) {
  await saveEncryptedRecords(ctx, [{
    recordId: "scratch-main",
    kind: "note",
    value: { tabs: input.tabs, activeId: input.activeId, receiveId: input.receiveId },
    expectedRevision: input.expectedRevision ?? null,
  }]);
}

/** Ensure vault write context exists for encrypted edits. */
export function vaultWriteReady(input: {
  encryptedLedger: boolean;
  userId: string | null;
  vaultId: string | null;
  keyId: string | null;
  client: ConvexReactClient;
}): VaultWriteContext | null {
  if (!input.encryptedLedger || !input.userId || !input.vaultId || !input.keyId) return null;
  if (!getVaultMasterKey()) return null;
  return { client: input.client, userId: input.userId, vaultId: input.vaultId, keyId: input.keyId };
}

export { api };
