import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

function toLog(row: {
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
}) {
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
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt
      ? new Date(row.completedAt).toISOString()
      : null,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    try {
      const rows = await ctx.db
        .query("statementUploads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const uploads = rows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(toLog);
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
      return {
        ok: true as const,
        upload: {
          ...toLog(row),
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
