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
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const prior = await ctx.db
      .query("statementUploads")
      .withIndex("by_userId_fileHash", (q) =>
        q.eq("userId", user._id).eq("fileHash", args.fileHash),
      )
      .collect();
    const completed = prior.find((row) => row.status === "completed");
    if (completed) {
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
    }

    for (const row of prior) {
      if (row.status !== "completed") {
        await ctx.db.delete(row._id);
      }
    }

    const institution = await ctx.db
      .query("institutions")
      .withIndex("by_userId_institutionId", (q) =>
        q.eq("userId", user._id).eq("institutionId", MANUAL_INSTITUTION_ID),
      )
      .unique();
    if (!institution) {
      await ctx.db.insert("institutions", {
        userId: user._id,
        institutionId: MANUAL_INSTITUTION_ID,
        name: "Manual statement uploads",
        createdAt: now,
        updatedAt: now,
      });
    }

    const accountName =
      args.accountName || args.institutionName || `Statement ${args.filename}`;

    const existingAccount = await ctx.db
      .query("accounts")
      .withIndex("by_userId_accountId", (q) =>
        q.eq("userId", user._id).eq("accountId", args.accountId),
      )
      .unique();

    const accountFields = {
      institutionId: MANUAL_INSTITUTION_ID,
      name: accountName,
      officialName: args.institutionName,
      mask: args.accountMask,
      type: args.accountType,
      subtype: args.accountSubtype,
      currentBalance: args.closingBalance,
      availableBalance: args.closingBalance,
      isoCurrencyCode: args.currency,
      updatedAt: now,
    };

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, accountFields);
    } else {
      await ctx.db.insert("accounts", {
        userId: user._id,
        accountId: args.accountId,
        ...accountFields,
      });
    }

    const existingUploads = await ctx.db
      .query("statementUploads")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const nextUploadId =
      existingUploads.reduce((max, row) => Math.max(max, row.uploadId), 0) + 1;

    let insertedCount = 0;
    let updatedCount = 0;

    for (const txn of args.transactions) {
      const { debit, credit } = splitDebitCredit(txn.amount);
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_userId_transactionId", (q) =>
          q.eq("userId", user._id).eq("transactionId", txn.transactionId),
        )
        .unique();

      const paperFields = {
        posted: txn.posted,
        authorized: txn.authorized,
        account: accountName,
        accountId: args.accountId,
        description: txn.description,
        originalDescription: txn.description,
        amount: txn.amount,
        debit,
        credit,
        currency: args.currency,
        pending: txn.pending,
        city: txn.city,
        region: txn.region,
        country: txn.country,
        source: "statement",
        statementUploadId: nextUploadId,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, paperFields);
        updatedCount += 1;
      } else {
        // merchantClean + merchantId filled later by resolve (fuzzy cache / AI).
        // merchantName is legacy-only; do not invent it on import.
        await ctx.db.insert("transactions", {
          userId: user._id,
          transactionId: txn.transactionId,
          ...paperFields,
          merchantId: null,
          merchantClean: null,
          merchantName: null,
          company: null,
          brand: null,
          section: null,
          category: null,
          subcategory: null,
          spread: null,
          transactionType: null,
          kind: null,
          sectionLegacyId: null,
          categoryLegacyId: null,
          subcategoryLegacyId: null,
          spreadLegacyId: null,
          transactionTypeLegacyId: null,
          kindLegacyId: null,
          tags: null,
          channel: null,
          txnCode: null,
          bankDirection: null,
          crossCheck: null,
          enrichment: null,
          website: null,
          logoUrl: null,
        });
        insertedCount += 1;
      }
    }

    const transactionCount = insertedCount + updatedCount;
    await ctx.db.insert("statementUploads", {
      userId: user._id,
      uploadId: nextUploadId,
      filename: args.filename,
      fileHash: args.fileHash,
      status: "completed",
      accountId: args.accountId,
      institutionName: args.institutionName,
      accountName: args.accountName,
      accountMask: args.accountMask,
      currency: args.currency,
      pageCount: args.pageCount,
      transactionCount,
      insertedCount,
      updatedCount,
      skippedCount: updatedCount,
      statementPeriodStart: args.statementPeriodStart,
      statementPeriodEnd: args.statementPeriodEnd,
      openingBalance: args.openingBalance,
      closingBalance: args.closingBalance,
      totalDebits: args.totalDebits,
      totalCredits: args.totalCredits,
      transactionSum: args.transactionSum,
      computedClosing: args.computedClosing,
      balanceDelta: args.balanceDelta,
      balanceOk: args.balanceOk,
      ocrMarkdown: args.ocrMarkdown?.trim() ? args.ocrMarkdown : null,
      error:
        args.balanceOk === false
          ? `Imported with balance mismatch (delta ${args.balanceDelta}).`
          : null,
      createdAt: now,
      completedAt: now,
    });

    return {
      ok: true as const,
      uploadId: nextUploadId,
      transactionCount,
      insertedCount,
      updatedCount,
      skippedCount: updatedCount,
      removedTwinCount: 0,
      duplicateFile: false,
      transactionIds: args.transactions.map((txn) => txn.transactionId),
      institutionName: args.institutionName,
      accountName: args.accountName,
      pageCount: args.pageCount,
      statementPeriodStart: args.statementPeriodStart,
      statementPeriodEnd: args.statementPeriodEnd,
      openingBalance: args.openingBalance,
      closingBalance: args.closingBalance,
      transactionSum: args.transactionSum,
      computedClosing: args.computedClosing,
      balanceDelta: args.balanceDelta,
      balanceOk: args.balanceOk,
    };
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
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

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

    const linked = await ctx.db
      .query("transactions")
      .withIndex("by_userId_statementUploadId", (q) =>
        q.eq("userId", user._id).eq("statementUploadId", args.uploadId),
      )
      .collect();

    let toDelete = linked;

    if (toDelete.length === 0 && row.accountId) {
      const accountId = row.accountId;
      const periodStart = row.statementPeriodStart;
      const periodEnd = row.statementPeriodEnd;

      const candidates = await ctx.db
        .query("transactions")
        .withIndex("by_userId_accountId_posted", (q) => {
          const base = q.eq("userId", user._id).eq("accountId", accountId);
          if (periodStart && periodEnd) {
            return base.gte("posted", periodStart).lte("posted", periodEnd);
          }
          if (periodStart) {
            return base.gte("posted", periodStart);
          }
          if (periodEnd) {
            return base.lte("posted", periodEnd);
          }
          return base;
        })
        .collect();

      toDelete = candidates.filter(
        (txn) =>
          txn.source === "statement" &&
          (txn.statementUploadId == null ||
            txn.statementUploadId === args.uploadId),
      );
    }

    for (const txn of toDelete) {
      await bumpMerchantTxnCount(ctx, txn.merchantId, -1);
      await ctx.db.delete(txn._id);
    }

    if (row.ocrStorageId) {
      await ctx.storage.delete(row.ocrStorageId);
    }

    await ctx.db.delete(row._id);

    if (row.accountId) {
      const remaining = await ctx.db
        .query("statementUploads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const sameAccount = remaining
        .filter(
          (upload) =>
            upload.accountId === row.accountId && upload.status === "completed",
        )
        .sort((a, b) => {
          const aEnd = a.statementPeriodEnd ?? "";
          const bEnd = b.statementPeriodEnd ?? "";
          if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
          return b.createdAt - a.createdAt;
        });

      const account = await ctx.db
        .query("accounts")
        .withIndex("by_userId_accountId", (q) =>
          q.eq("userId", user._id).eq("accountId", row.accountId!),
        )
        .unique();

      if (account) {
        const latest = sameAccount[0];
        const leftoverTx = await ctx.db
          .query("transactions")
          .withIndex("by_userId_accountId_posted", (q) =>
            q.eq("userId", user._id).eq("accountId", row.accountId!),
          )
          .first();
        if (!latest && !leftoverTx) {
          await ctx.db.delete(account._id);
        } else {
          await ctx.db.patch(account._id, {
            currentBalance: latest?.closingBalance ?? null,
            availableBalance: latest?.closingBalance ?? null,
            updatedAt: Date.now(),
          });
        }
      }
    }

    return {
      ok: true as const,
      filename: row.filename,
      deletedTransactions: toDelete.length,
    };
  },
});
