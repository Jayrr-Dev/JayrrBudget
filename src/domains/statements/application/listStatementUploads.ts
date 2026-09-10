import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { statementUploads } from "@/shared/db/schema";
import type {
  StatementUploadDetail,
  StatementUploadLog,
} from "@/domains/statements/domain/types";

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type LogRow = {
  id: number;
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
  balanceOk: boolean | number | null;
  error: string | null;
  hasOcr: number | boolean | null;
  createdAt: Date;
  completedAt: Date | null;
};

function toLog(row: LogRow): StatementUploadLog {
  return {
    id: row.id,
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
    balanceOk:
      row.balanceOk == null ? null : Boolean(row.balanceOk),
    error: row.error,
    hasOcr: Boolean(row.hasOcr),
    createdAt: row.createdAt.toISOString(),
    completedAt: toIso(row.completedAt),
  };
}

const logColumns = {
  id: statementUploads.id,
  filename: statementUploads.filename,
  status: statementUploads.status,
  institutionName: statementUploads.institutionName,
  accountName: statementUploads.accountName,
  accountMask: statementUploads.accountMask,
  currency: statementUploads.currency,
  pageCount: statementUploads.pageCount,
  transactionCount: statementUploads.transactionCount,
  insertedCount: statementUploads.insertedCount,
  updatedCount: statementUploads.updatedCount,
  skippedCount: statementUploads.skippedCount,
  statementPeriodStart: statementUploads.statementPeriodStart,
  statementPeriodEnd: statementUploads.statementPeriodEnd,
  openingBalance: statementUploads.openingBalance,
  closingBalance: statementUploads.closingBalance,
  totalDebits: statementUploads.totalDebits,
  totalCredits: statementUploads.totalCredits,
  transactionSum: statementUploads.transactionSum,
  computedClosing: statementUploads.computedClosing,
  balanceDelta: statementUploads.balanceDelta,
  balanceOk: statementUploads.balanceOk,
  error: statementUploads.error,
  hasOcr: sql<number>`CASE WHEN ${statementUploads.ocrMarkdown} IS NOT NULL AND length(trim(${statementUploads.ocrMarkdown})) > 0 THEN 1 ELSE 0 END`.as(
    "has_ocr",
  ),
  createdAt: statementUploads.createdAt,
  completedAt: statementUploads.completedAt,
};

export async function listStatementUploads(): Promise<
  | { ok: true; uploads: StatementUploadLog[] }
  | { ok: false; status: number; error: string }
> {
  try {
    const db = getDb();
    const rows = await db
      .select(logColumns)
      .from(statementUploads)
      .orderBy(desc(statementUploads.createdAt));

    return {
      ok: true,
      uploads: rows.map(toLog),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list statement uploads",
    };
  }
}

export async function getStatementUpload(id: number): Promise<
  | { ok: true; upload: StatementUploadDetail }
  | { ok: false; status: number; error: string }
> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(statementUploads)
      .where(eq(statementUploads.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { ok: false, status: 404, error: "Statement upload not found." };
    }

    return {
      ok: true,
      upload: {
        ...toLog({
          ...row,
          hasOcr: Boolean(row.ocrMarkdown?.trim()),
        }),
        ocrMarkdown: row.ocrMarkdown,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load statement upload",
    };
  }
}
