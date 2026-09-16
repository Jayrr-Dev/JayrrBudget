import { decryptJson } from "@/crypto/envelope";
import { getVaultMasterKey } from "@/crypto/session";
import type { EncryptedEnvelopeV1, EnvelopeKind } from "@/crypto/types";
import type {
  PrivateAccount,
  PrivateLedger,
  PrivateLoanDocument,
  PrivateLoanTerms,
  PrivateMerchant,
  PrivateNote,
  PrivateScratchPad,
  PrivateStatementLog,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";
import { api } from "@convex/_generated/api";

export type VaultListClient = {
  query: (
    reference: unknown,
    args: unknown,
  ) => Promise<{
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
  statementLogs: [],
  loanDocuments: [],
};

function asTx(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateTransaction | null {
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
    foreignAmount:
      row.foreignAmount == null || !Number.isFinite(Number(row.foreignAmount))
        ? null
        : Number(row.foreignAmount),
    foreignCurrency:
      row.foreignCurrency == null ? null : String(row.foreignCurrency),
    exchangeRate:
      row.exchangeRate == null || !Number.isFinite(Number(row.exchangeRate))
        ? null
        : Number(row.exchangeRate),
    accountId: row.accountId == null ? null : String(row.accountId),
    merchantName: row.merchantName == null ? null : String(row.merchantName),
    merchantClean: row.merchantClean == null ? null : String(row.merchantClean),
    sectionName: row.sectionName == null ? null : String(row.sectionName),
    categoryName: row.categoryName == null ? null : String(row.categoryName),
    subcategoryName:
      row.subcategoryName == null ? null : String(row.subcategoryName),
    spreadName: row.spreadName == null ? null : String(row.spreadName),
    tagNames: Array.isArray(row.tagNames) ? row.tagNames.map(String) : [],
    pending: Boolean(row.pending),
    authorizedDate:
      row.authorizedDate == null ? null : String(row.authorizedDate),
    city: row.city == null ? null : String(row.city),
    region: row.region == null ? null : String(row.region),
    country: row.country == null ? null : String(row.country),
    transactionTypeName:
      row.transactionTypeName == null ? null : String(row.transactionTypeName),
    txnCode: row.txnCode == null ? null : String(row.txnCode),
    channel: row.channel == null ? null : String(row.channel),
    statementRecordId:
      row.statementRecordId == null ? null : String(row.statementRecordId),
    source: row.source == null ? null : String(row.source),
  };
}

function asAccount(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateAccount | null {
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
    currentBalance:
      row.currentBalance == null ? null : Number(row.currentBalance),
    availableBalance:
      row.availableBalance == null ? null : Number(row.availableBalance),
    isoCurrencyCode:
      row.isoCurrencyCode == null ? null : String(row.isoCurrencyCode),
  };
}

function asMerchant(
  value: unknown,
  recordId: string,
  revision: number,
  timestamps?: { createdAt?: number; updatedAt?: number },
): PrivateMerchant | null {
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
    logoUrl: row.logoUrl == null ? null : String(row.logoUrl),
    createdAt: timestamps?.createdAt,
    updatedAt: timestamps?.updatedAt,
  };
}

function asNote(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateNote | null {
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

function asScratch(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateScratchPad | null {
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

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStatementLog(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateStatementLog | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.type != null && row.type !== "statement_import") return null;
  const filename = String(row.filename ?? "").trim();
  if (!filename) return null;
  return {
    recordId,
    revision,
    filename,
    fileHash: String(row.fileHash ?? ""),
    status: String(row.status ?? "completed"),
    institutionName:
      row.institutionName == null ? null : String(row.institutionName),
    accountName: row.accountName == null ? null : String(row.accountName),
    accountMask: row.accountMask == null ? null : String(row.accountMask),
    currency: row.currency == null ? null : String(row.currency),
    pageCount: asNumber(row.pageCount),
    transactionCount: asNumber(row.transactionCount),
    insertedCount: asNumber(row.insertedCount),
    updatedCount: asNumber(row.updatedCount),
    skippedCount: asNumber(row.skippedCount),
    statementPeriodStart:
      row.statementPeriodStart == null
        ? null
        : String(row.statementPeriodStart),
    statementPeriodEnd:
      row.statementPeriodEnd == null ? null : String(row.statementPeriodEnd),
    openingBalance: asNumber(row.openingBalance),
    closingBalance: asNumber(row.closingBalance),
    transactionSum: asNumber(row.transactionSum),
    computedClosing: asNumber(row.computedClosing),
    balanceDelta: asNumber(row.balanceDelta),
    balanceOk: typeof row.balanceOk === "boolean" ? row.balanceOk : null,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    ocrMarkdown: row.ocrMarkdown == null ? null : String(row.ocrMarkdown),
    ocrRecordId: row.ocrRecordId == null ? null : String(row.ocrRecordId),
    ocrRevision: null,
    transactionIds: Array.isArray(row.transactionIds)
      ? row.transactionIds.map(String)
      : [],
  };
}

function asOcrDoc(value: unknown, recordId: string, revision: number) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.type !== "statement_ocr") return null;
  return {
    recordId,
    revision,
    statementRecordId: String(row.statementRecordId ?? ""),
    ocrMarkdown: String(row.ocrMarkdown ?? ""),
  };
}

function asLoanOcrDoc(value: unknown, recordId: string, revision: number) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.type !== "loan_ocr") return null;
  return {
    recordId,
    revision,
    loanDocumentRecordId: String(row.loanDocumentRecordId ?? ""),
    ocrMarkdown: String(row.ocrMarkdown ?? ""),
  };
}

function asLoanDocument(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateLoanDocument | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.type !== "loan_document") return null;
  const filename = String(row.filename ?? "").trim();
  if (!filename) return null;
  return {
    recordId,
    revision,
    filename,
    fileHash: String(row.fileHash ?? ""),
    status: String(row.status ?? "completed"),
    pageCount: asNumber(row.pageCount),
    accountId: row.accountId == null ? null : String(row.accountId),
    fields:
      row.fields && typeof row.fields === "object"
        ? (row.fields as Record<string, unknown>)
        : null,
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    ocrMarkdown: null,
    ocrRecordId: row.ocrRecordId == null ? null : String(row.ocrRecordId),
    ocrRevision: null,
  };
}

function asLoan(
  value: unknown,
  recordId: string,
  revision: number,
): PrivateLoanTerms | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const accountId = String(row.accountId ?? "");
  const principal = Number(row.principal);
  const annualRate = Number(row.annualRate);
  const paymentAmount = Number(row.paymentAmount);
  const paymentCount = Number(row.paymentCount);
  const firstPaymentDate = String(row.firstPaymentDate ?? "");
  if (
    !accountId ||
    !firstPaymentDate ||
    ![principal, annualRate, paymentAmount, paymentCount].every(Number.isFinite)
  )
    return null;
  return {
    recordId,
    revision,
    accountId,
    principal,
    annualRate,
    paymentAmount,
    firstPaymentDate,
    paymentCount,
    matchMerchantClean:
      row.matchMerchantClean == null ? null : String(row.matchMerchantClean),
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
    statementLogs: [],
    loanDocuments: [],
  };
  const ocrDocs: Array<NonNullable<ReturnType<typeof asOcrDoc>>> = [];
  const loanOcrDocs: Array<NonNullable<ReturnType<typeof asLoanOcrDoc>>> = [];

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
          {
            userId: input.userId,
            recordId,
            kind,
            keyId: String(row.keyId ?? ""),
          },
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
            const merchant = asMerchant(value, recordId, revision, {
              createdAt: Number(row.createdAt ?? 0) || undefined,
              updatedAt: Number(row.updatedAt ?? 0) || undefined,
            });
            if (merchant) ledger.merchants.push(merchant);
          } else {
            const note = asNote(value, recordId, revision);
            if (note) ledger.notes.push(note);
          }
        } else if (kind === "document") {
          const ocr = asOcrDoc(value, recordId, revision);
          if (ocr) {
            ocrDocs.push(ocr);
          } else {
            const loanOcr = asLoanOcrDoc(value, recordId, revision);
            if (loanOcr) {
              loanOcrDocs.push(loanOcr);
            } else {
              const loanDoc = asLoanDocument(value, recordId, revision);
              if (loanDoc) {
                ledger.loanDocuments.push(loanDoc);
              } else {
                const log = asStatementLog(value, recordId, revision);
                if (log) ledger.statementLogs.push(log);
              }
            }
          }
        }
      } catch {
        // Stale key or corrupt row must not break the whole ledger.
      }
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
    if (!cursor) break;
  }

  for (const ocr of ocrDocs) {
    const log = ledger.statementLogs.find(
      (row) =>
        row.recordId === ocr.statementRecordId ||
        (row.fileHash && `ocr-${row.fileHash}` === ocr.recordId),
    );
    if (!log) continue;
    log.ocrMarkdown = ocr.ocrMarkdown;
    log.ocrRecordId = ocr.recordId;
    log.ocrRevision = ocr.revision;
  }

  for (const ocr of loanOcrDocs) {
    const doc = ledger.loanDocuments.find(
      (row) =>
        row.recordId === ocr.loanDocumentRecordId ||
        (row.fileHash && `loan-ocr-${row.fileHash}` === ocr.recordId),
    );
    if (!doc) continue;
    doc.ocrMarkdown = ocr.ocrMarkdown;
    doc.ocrRecordId = ocr.recordId;
    doc.ocrRevision = ocr.revision;
  }

  ledger.transactions.sort((a, b) => b.date.localeCompare(a.date));
  ledger.statementLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!ledger.statementLogs.length && ledger.transactions.length) {
    const account = ledger.accounts[0];
    ledger.statementLogs.push({
      recordId: "statement-inferred",
      revision: 0,
      filename: account?.name
        ? `${account.name} statement`
        : "Encrypted statement",
      fileHash: "",
      status: "completed",
      institutionName: account?.officialName ?? account?.name ?? null,
      accountName: account?.name ?? null,
      accountMask: account?.mask ?? null,
      currency: account?.isoCurrencyCode ?? null,
      pageCount: null,
      transactionCount: ledger.transactions.length,
      insertedCount: ledger.transactions.length,
      updatedCount: 0,
      skippedCount: 0,
      statementPeriodStart: null,
      statementPeriodEnd: null,
      openingBalance: null,
      closingBalance: account?.currentBalance ?? null,
      transactionSum: null,
      computedClosing: null,
      balanceDelta: null,
      balanceOk: null,
      createdAt: ledger.transactions[0]?.date
        ? `${ledger.transactions[0].date}T00:00:00.000Z`
        : new Date().toISOString(),
      ocrMarkdown: null,
      transactionIds: ledger.transactions.map((tx) => tx.recordId),
    });
  }
  return ledger;
}
