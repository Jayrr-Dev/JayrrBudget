import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { isCategorized } from "./lib/categorization";
import { bumpMerchantTxnCount } from "./lib/merchantTxnCount";

const MANUAL_INSTITUTION_ID = "manual-statements";

function toLog(
  row: {
    uploadId: number;
    filename: string;
    status: string;
    institutionName: string | null;
    accountName: string | null;
    accountMask: string | null;
    currency: string | null;
    pageCount: number | null;
    transactionCount: number | null;
    insertedCount: number | null;
    updatedCount: number | null;
    skippedCount: number | null;
    statementPeriodStart: string | null;
    statementPeriodEnd: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
    totalDebits: number | null;
    totalCredits: number | null;
    transactionSum: number | null;
    computedClosing: number | null;
    balanceDelta: number | null;
    balanceOk: boolean | null;
    error: string | null;
    ocrMarkdown?: string | null;
    ocrStorageId?: unknown;
    createdAt: number;
    completedAt: number | null;
  },
  categorization?: { categorized: boolean; categorizedCount: number },
) {
  return {
    id: row.uploadId,
    filename: row.filename,
    status: row.status,
    institutionName: row.institutionName,
    accountName: row.accountName,
    accountMask: row.accountMask,
    currency: row.currency,
    pageCount: row.pageCount,
    transactionCount: row.transactionCount,
    insertedCount: row.insertedCount,
    updatedCount: row.updatedCount,
    skippedCount: row.skippedCount,
    statementPeriodStart: row.statementPeriodStart,
    statementPeriodEnd: row.statementPeriodEnd,
    openingBalance: row.openingBalance,
    closingBalance: row.closingBalance,
    totalDebits: row.totalDebits,
    totalCredits: row.totalCredits,
    transactionSum: row.transactionSum,
    computedClosing: row.computedClosing,
    balanceDelta: row.balanceDelta,
    balanceOk: row.balanceOk,
    error: row.error,
    hasOcr: Boolean(row.ocrStorageId || row.ocrMarkdown?.trim()),
    categorized: categorization?.categorized ?? false,
    categorizedCount: categorization?.categorizedCount ?? 0,
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt
      ? new Date(row.completedAt).toISOString()
      : null,
  };
}

const statementLogValidator = v.object({
  id: v.number(),
  filename: v.string(),
  status: v.string(),
  institutionName: v.union(v.string(), v.null()),
  accountName: v.union(v.string(), v.null()),
  accountMask: v.union(v.string(), v.null()),
  currency: v.union(v.string(), v.null()),
  pageCount: v.union(v.number(), v.null()),
  transactionCount: v.union(v.number(), v.null()),
  insertedCount: v.union(v.number(), v.null()),
  updatedCount: v.union(v.number(), v.null()),
  skippedCount: v.union(v.number(), v.null()),
  statementPeriodStart: v.union(v.string(), v.null()),
  statementPeriodEnd: v.union(v.string(), v.null()),
  openingBalance: v.union(v.number(), v.null()),
  closingBalance: v.union(v.number(), v.null()),
  totalDebits: v.union(v.number(), v.null()),
  totalCredits: v.union(v.number(), v.null()),
  transactionSum: v.union(v.number(), v.null()),
  computedClosing: v.union(v.number(), v.null()),
  balanceDelta: v.union(v.number(), v.null()),
  balanceOk: v.union(v.boolean(), v.null()),
  error: v.union(v.string(), v.null()),
  hasOcr: v.boolean(),
  categorized: v.boolean(),
  categorizedCount: v.number(),
  createdAt: v.string(),
  completedAt: v.union(v.string(), v.null()),
});

const listResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    uploads: v.array(statementLogValidator),
  }),
  v.object({
    ok: v.literal(false),
    status: v.number(),
    error: v.string(),
  }),
);

function splitDebitCredit(amount: number) {
  if (amount > 0) return { debit: amount, credit: null as number | null };
  if (amount < 0) return { debit: null as number | null, credit: -amount };
  return { debit: null as number | null, credit: null as number | null };
}

const paperTxnValidator = v.object({
  transactionId: v.string(),
  posted: v.string(),
  authorized: v.union(v.string(), v.null()),
  description: v.string(),
  amount: v.number(),
  pending: v.boolean(),
  city: v.union(v.string(), v.null()),
  region: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  foreignAmount: v.optional(v.union(v.number(), v.null())),
  foreignCurrency: v.optional(v.union(v.string(), v.null())),
  exchangeRate: v.optional(v.union(v.number(), v.null())),
});

const importResultValidator = v.object({
  ok: v.literal(true),
  uploadId: v.number(),
  transactionCount: v.number(),
  insertedCount: v.number(),
  updatedCount: v.number(),
  skippedCount: v.number(),
  removedTwinCount: v.number(),
  duplicateFile: v.boolean(),
  transactionIds: v.array(v.string()),
  institutionName: v.union(v.string(), v.null()),
  accountName: v.union(v.string(), v.null()),
  pageCount: v.number(),
  statementPeriodStart: v.union(v.string(), v.null()),
  statementPeriodEnd: v.union(v.string(), v.null()),
  openingBalance: v.union(v.number(), v.null()),
  closingBalance: v.union(v.number(), v.null()),
  transactionSum: v.union(v.number(), v.null()),
  computedClosing: v.union(v.number(), v.null()),
  balanceDelta: v.union(v.number(), v.null()),
  balanceOk: v.union(v.boolean(), v.null()),
});

const fingerprintValidator = v.object({
  fileHash: v.string(),
  filename: v.string(),
  pageCount: v.union(v.number(), v.null()),
  statementPeriodStart: v.union(v.string(), v.null()),
  statementPeriodEnd: v.union(v.string(), v.null()),
});

/**
 * Fingerprints for the upload picker - mark dups before OCR starts.
 */
export const listCompletedFingerprints = query({
  args: {},
  returns: v.array(fingerprintValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("statementUploads")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const out: Array<{
      fileHash: string;
      filename: string;
      pageCount: number | null;
      statementPeriodStart: string | null;
      statementPeriodEnd: string | null;
    }> = [];
    for (const row of rows) {
      if (row.status !== "completed" || !row.fileHash) continue;
      out.push({
        fileHash: row.fileHash,
        filename: row.filename,
        pageCount: row.pageCount,
        statementPeriodStart: row.statementPeriodStart,
        statementPeriodEnd: row.statementPeriodEnd,
      });
    }
    return out;
  },
});

/**
 * Cheap pre-OCR duplicate check: same PDF bytes already imported for this user.
 * Filename/pages alone are weak; hash is available before Mistral/OpenRouter.
 */
export const findCompletedByFileHash = query({
  args: { fileHash: v.string() },
  returns: v.union(importResultValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const prior = await ctx.db
      .query("statementUploads")
      .withIndex("by_userId_fileHash", (q) =>
        q.eq("userId", user._id).eq("fileHash", args.fileHash),
      )
      .collect();
    const completed = prior.find((row) => row.status === "completed");
    if (!completed) return null;

    return {
      ok: true as const,
      uploadId: completed.uploadId,
      transactionCount: completed.transactionCount ?? 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: completed.transactionCount ?? 0,
      removedTwinCount: 0,
      duplicateFile: true,
      transactionIds: [],
      institutionName: completed.institutionName,
      accountName: completed.accountName,
      pageCount: completed.pageCount ?? 0,
      statementPeriodStart: completed.statementPeriodStart,
      statementPeriodEnd: completed.statementPeriodEnd,
      openingBalance: completed.openingBalance,
      closingBalance: completed.closingBalance,
      transactionSum: completed.transactionSum,
      computedClosing: completed.computedClosing,
      balanceDelta: completed.balanceDelta,
      balanceOk: completed.balanceOk,
    };
  },
});

export const list = query({
  args: {},
  returns: listResultValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    try {
      const rows = await ctx.db
        .query("statementUploads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const uploads = [];
      for (const row of rows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)) {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_userId_statementUploadId", (q) =>
            q.eq("userId", user._id).eq("statementUploadId", row.uploadId),
          )
          .collect();
        const categorizedCount = txs.filter((tx) => isCategorized(tx)).length;
        const total = txs.length;
        uploads.push(
          toLog(row, {
            categorized: total > 0 && categorizedCount === total,
            categorizedCount,
          }),
        );
      }
      return { ok: true as const, uploads };
    } catch (error) {
      return {
        ok: false as const,
        status: 500,
        error:
          error instanceof Error
            ? error.message
            : "Failed to list statement uploads",
      };
    }
  },
});

const AI_STATEMENT_LIMIT = 24;

const aiStatementRow = v.object({
  uploadId: v.number(),
  accountId: v.union(v.string(), v.null()),
  institution: v.union(v.string(), v.null()),
  account: v.union(v.string(), v.null()),
  mask: v.union(v.string(), v.null()),
  currency: v.union(v.string(), v.null()),
  periodStart: v.union(v.string(), v.null()),
  periodEnd: v.union(v.string(), v.null()),
  openingBalance: v.union(v.number(), v.null()),
  closingBalance: v.union(v.number(), v.null()),
  totalDebits: v.union(v.number(), v.null()),
  totalCredits: v.union(v.number(), v.null()),
  transactionCount: v.union(v.number(), v.null()),
  /** true = statement math reconciles with imported rows. */
  balanceOk: v.union(v.boolean(), v.null()),
});

/**
 * Compact completed statements for AI context. Newest period first.
 * Optional `account` narrows by account id, name, or last-4 mask.
 */
export const listForAi = query({
  args: { account: v.optional(v.string()) },
  returns: v.array(aiStatementRow),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("statementUploads")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "completed"),
      )
      .collect();
    const wanted = args.account?.trim().toLowerCase() ?? "";
    return rows
      .filter((row) => {
        if (!wanted) return true;
        return (
          row.accountId === args.account ||
          (row.accountName ?? "").toLowerCase().includes(wanted) ||
          (row.accountMask ? wanted.endsWith(row.accountMask) : false)
        );
      })
      .sort((a, b) =>
        (b.statementPeriodEnd ?? "").localeCompare(a.statementPeriodEnd ?? "") ||
        b.createdAt - a.createdAt,
      )
      .slice(0, AI_STATEMENT_LIMIT)
      .map((row) => ({
        uploadId: row.uploadId,
        accountId: row.accountId,
        institution: row.institutionName,
        account: row.accountName,
        mask: row.accountMask,
        currency: row.currency,
        periodStart: row.statementPeriodStart,
        periodEnd: row.statementPeriodEnd,
        openingBalance: row.openingBalance,
        closingBalance: row.closingBalance,
        totalDebits: row.totalDebits,
        totalCredits: row.totalCredits,
        transactionCount: row.transactionCount,
        balanceOk: row.balanceOk,
      }));
  },
});

export const get = query({
  args: { uploadId: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    try {
      const row = await ctx.db
        .query("statementUploads")
        .withIndex("by_userId_uploadId", (q) =>
          q.eq("userId", user._id).eq("uploadId", args.uploadId),
        )
        .unique();
      if (!row) {
        return {
          ok: false as const,
          status: 404,
          error: "Statement upload not found.",
        };
      }
      const txs = await ctx.db
        .query("transactions")
        .withIndex("by_userId_statementUploadId", (q) =>
          q.eq("userId", user._id).eq("statementUploadId", args.uploadId),
        )
        .collect();
      const categorizedCount = txs.filter((tx) => isCategorized(tx)).length;
      const total = txs.length;
      return {
        ok: true as const,
        upload: {
          ...toLog(row, {
            categorized: total > 0 && categorizedCount === total,
            categorizedCount,
          }),
          ocrMarkdown: row.ocrMarkdown ?? null,
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        status: 500,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load statement upload",
      };
    }
  },
});

/**
 * Persist OCR → paper-facts parse results.
 * Writes statement upload + account + transaction rows (paper columns only).
 */
export const importPaperFacts = mutation({
  args: {
    filename: v.string(),
    fileHash: v.string(),
    pageCount: v.number(),
    institutionName: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
    accountMask: v.union(v.string(), v.null()),
    currency: v.string(),
    accountId: v.string(),
    accountType: v.string(),
    accountSubtype: v.union(v.string(), v.null()),
    statementPeriodStart: v.union(v.string(), v.null()),
    statementPeriodEnd: v.union(v.string(), v.null()),
    openingBalance: v.union(v.number(), v.null()),
    closingBalance: v.union(v.number(), v.null()),
    totalDebits: v.union(v.number(), v.null()),
    totalCredits: v.union(v.number(), v.null()),
    transactionSum: v.union(v.number(), v.null()),
    computedClosing: v.union(v.number(), v.null()),
    balanceDelta: v.union(v.number(), v.null()),
    balanceOk: v.union(v.boolean(), v.null()),
    ocrMarkdown: v.union(v.string(), v.null()),
    transactions: v.array(paperTxnValidator),
  },
  returns: importResultValidator,
  handler: async () => {
    throw new Error("importPaperFacts is retired. Use the private ledger (vault).");
  },
});

const removeResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    filename: v.string(),
    deletedTransactions: v.number(),
  }),
  v.object({
    ok: v.literal(false),
    status: v.number(),
    error: v.string(),
  }),
);

/**
 * Delete an owned statement upload and its ledger children.
 * Prefer statementUploadId links; fall back to account + statement window.
 */
export const remove = mutation({
  args: { uploadId: v.number() },
  returns: removeResultValidator,
  handler: async () => {
    throw new Error("remove is retired. Use the private ledger (vault).");
  },
});
