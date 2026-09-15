import { api } from "@convex/_generated/api";
import { decryptJson } from "@/crypto/envelope";
import { getVaultMasterKey } from "@/crypto/session";
import type { EncryptedEnvelopeV1, EnvelopeKind } from "@/crypto/types";
import type {
  PrivateAccount,
  PrivateLedger,
  PrivateLoanTerms,
  PrivateMerchant,
  PrivateNote,
  PrivateScratchPad,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";

export type VaultListClient = {
  query: (reference: unknown, args: unknown) => Promise<{
    page: Array<Record<string, unknown>>;
    isDone: boolean;
    continueCursor: string | null;
  }>;
};

const EMPTY: PrivateLedger = {
  transactions: [],
  accounts: [],
  merchants: [],
  notes: [],
  scratchPads: [],
  loans: [],
};

function asTx(value: unknown, recordId: string, revision: number): PrivateTransaction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const date = String(row.date ?? "");
  const description = String(row.description ?? row.name ?? "");
  const amount = Number(row.amount);
  if (!date || !description || !Number.isFinite(amount)) return null;
  return {
    recordId,
    revision,
    date,
    description,
    amount,
    currency: String(row.currency ?? row.isoCurrencyCode ?? "CAD"),
    accountId: row.accountId == null ? null : String(row.accountId),
    merchantName: row.merchantName == null ? null : String(row.merchantName),
    merchantClean: row.merchantClean == null ? null : String(row.merchantClean),
    sectionName: row.sectionName == null ? null : String(row.sectionName),
    categoryName: row.categoryName == null ? null : String(row.categoryName),
    subcategoryName: row.subcategoryName == null ? null : String(row.subcategoryName),
    spreadName: row.spreadName == null ? null : String(row.spreadName),
    tagNames: Array.isArray(row.tagNames) ? row.tagNames.map(String) : [],
    pending: Boolean(row.pending),
  };
}

function asAccount(value: unknown, recordId: string, revision: number): PrivateAccount | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const accountId = String(row.accountId ?? recordId);
  const name = String(row.name ?? "");
  if (!name) return null;
  return {
    recordId,
    revision,
    accountId,
    name,
    officialName: row.officialName == null ? null : String(row.officialName),
    mask: row.mask == null ? null : String(row.mask),
    type: row.type == null ? null : String(row.type),
    subtype: row.subtype == null ? null : String(row.subtype),
    currentBalance: row.currentBalance == null ? null : Number(row.currentBalance),
    availableBalance: row.availableBalance == null ? null : Number(row.availableBalance),
    isoCurrencyCode: row.isoCurrencyCode == null ? null : String(row.isoCurrencyCode),
  };
}

function asMerchant(value: unknown, recordId: string, revision: number): PrivateMerchant | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = String(row.name ?? "");
  if (!name) return null;
  return {
    recordId,
    revision,
    merchantId: String(row.merchantId ?? recordId),
    name,
    rawName: row.rawName == null ? null : String(row.rawName),
    company: row.company == null ? null : String(row.company),
    brand: row.brand == null ? null : String(row.brand),
    website: row.website == null ? null : String(row.website),
  };
}

function asNote(value: unknown, recordId: string, revision: number): PrivateNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    recordId,
    revision,
    tabId: String(row.tabId ?? recordId),
    title: String(row.title ?? "Note"),
    content: String(row.content ?? ""),
  };
}

function asScratch(value: unknown, recordId: string, revision: number): PrivateScratchPad | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.tabs)) return null;
  return {
    recordId,
    revision,
    tabs: row.tabs as PrivateScratchPad["tabs"],
    activeId: String(row.activeId ?? ""),
    receiveId: String(row.receiveId ?? ""),
  };
}

function asLoan(value: unknown, recordId: string, revision: number): PrivateLoanTerms | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const accountId = String(row.accountId ?? "");
  const principal = Number(row.principal);
  const annualRate = Number(row.annualRate);
  const paymentAmount = Number(row.paymentAmount);
  const paymentCount = Number(row.paymentCount);
  const firstPaymentDate = String(row.firstPaymentDate ?? "");
  if (!accountId || !firstPaymentDate || ![principal, annualRate, paymentAmount, paymentCount].every(Number.isFinite)) return null;
  return {
    recordId,
    revision,
    accountId,
    principal,
    annualRate,
    paymentAmount,
    firstPaymentDate,
    paymentCount,
    matchMerchantClean: row.matchMerchantClean == null ? null : String(row.matchMerchantClean),
    matchAmount: row.matchAmount == null ? null : Number(row.matchAmount),
  };
}

/** Loads ciphertext pages and decrypts into an in-memory ledger. Returns empty when locked. */
export async function loadPrivateLedger(
  client: VaultListClient,
  input: { userId: string; vaultId: string },
): Promise<PrivateLedger> {
  const masterKey = getVaultMasterKey();
  if (!masterKey) return EMPTY;

  const ledger: PrivateLedger = {
    transactions: [],
    accounts: [],
    merchants: [],
    notes: [],
    scratchPads: [],
    loans: [],
  };

  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 40; pageIndex += 1) {
    const page = await client.query(api.vaults.listRecords, {
      vaultId: input.vaultId,
      paginationOpts: { numItems: 100, cursor },
    });
    for (const row of page.page) {
      if (row.deleted) continue;
      const kind = String(row.kind ?? "") as EnvelopeKind;
      const recordId = String(row.recordId ?? "");
      const revision = Number(row.revision ?? 0);
      const envelope = row as unknown as EncryptedEnvelopeV1;
      try {
        const value = await decryptJson<unknown>(
          envelope,
          { userId: input.userId, recordId, kind, keyId: String(row.keyId ?? "") },
          masterKey,
        );
        if (kind === "tx" || kind === "tx_batch") {
          const tx = asTx(value, recordId, revision);
          if (tx) ledger.transactions.push(tx);
        } else if (kind === "account_meta") {
          const account = asAccount(value, recordId, revision);
          if (account) ledger.accounts.push(account);
        } else if (kind === "category") {
          // reserved for taxonomy prefs
        } else if (kind === "note") {
          if (recordId.startsWith("scratch-")) {
            const pad = asScratch(value, recordId, revision);
            if (pad) ledger.scratchPads.push(pad);
          } else if (recordId.startsWith("loan-")) {
            const loan = asLoan(value, recordId, revision);
            if (loan) ledger.loans.push(loan);
          } else if (recordId.startsWith("merchant-")) {
            const merchant = asMerchant(value, recordId, revision);
            if (merchant) ledger.merchants.push(merchant);
          } else {
            const note = asNote(value, recordId, revision);
            if (note) ledger.notes.push(note);
          }
        } else if (kind === "document") {
          // documents stay opaque for now
        }
      } catch {
        // Stale key or corrupt row must not break the whole ledger.
      }
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
    if (!cursor) break;
  }

  ledger.transactions.sort((a, b) => b.date.localeCompare(a.date));
  return ledger;
}
