import { count, desc, eq, max, min } from "drizzle-orm";
import type { DashboardData } from "@/domains/dashboard/domain/types";
import { getDb } from "@/shared/db";
import {
  accounts,
  institutions,
  statementUploads,
  transactions,
} from "@/shared/db/schema";

export type GetDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: number; error: string };

function splitTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,|;]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export async function getDashboard(options?: {
  /** Cap ledger rows. Omit or pass null for every row. */
  transactionLimit?: number | null;
}): Promise<GetDashboardResult> {
  try {
    const db = getDb();
    const transactionLimit = options?.transactionLimit;

    const [institutionRows, accountRows, txnQuery, stats, statementStats] =
      await Promise.all([
        db
          .select({
            institutionId: institutions.institutionId,
            name: institutions.name,
          })
          .from(institutions),
        db
          .select({
            accountId: accounts.accountId,
            name: accounts.name,
            officialName: accounts.officialName,
            mask: accounts.mask,
            type: accounts.type,
            subtype: accounts.subtype,
            currentBalance: accounts.currentBalance,
            availableBalance: accounts.availableBalance,
            isoCurrencyCode: accounts.isoCurrencyCode,
          })
          .from(accounts),
        (() => {
          const query = db
            .select()
            .from(transactions)
            .orderBy(desc(transactions.posted), desc(transactions.id));

          if (
            typeof transactionLimit === "number" &&
            Number.isFinite(transactionLimit) &&
            transactionLimit > 0
          ) {
            return query.limit(transactionLimit);
          }
          return query;
        })(),
        db
          .select({
            transactionCount: count(),
            earliestDate: min(transactions.posted),
            latestDate: max(transactions.posted),
          })
          .from(transactions),
        db
          .select({
            latestStatementDate: max(statementUploads.statementPeriodEnd),
          })
          .from(statementUploads)
          .where(eq(statementUploads.status, "completed")),
      ]);

    const txnRows = await txnQuery;

    const data: DashboardData = {
      institutions: institutionRows,
      accounts: accountRows,
      transactions: txnRows.map((txn) => {
        const kindNames = txn.kind ? [txn.kind] : [];
        return {
          transactionId: txn.transactionId,
          accountId: txn.accountId,
          name: txn.description,
          merchantName: txn.merchantName,
          merchantClean: txn.merchantClean,
          companyName: txn.company,
          brandName: txn.brand,
          sectionName: txn.section,
          categoryName: txn.category,
          transactionTypeName: txn.transactionType,
          typeName: txn.kind,
          typeNames: kindNames,
          subcategoryName: txn.subcategory,
          tagNames: splitTags(txn.tags),
          enrichmentStatus: txn.enrichment,
          amount: txn.amount,
          isoCurrencyCode: txn.currency,
          date: txn.posted,
          authorizedDate: txn.authorized,
          pending: Boolean(txn.pending),
          categoryPrimary: txn.categoryPrimary,
          categoryDetailed: txn.categoryDetailed,
          categoryConfidence: txn.categoryConfidence,
          paymentChannel: txn.channel,
          transactionCode: txn.txnCode,
          website: txn.website,
          logoUrl: txn.logoUrl,
          locationCity: txn.city,
          locationRegion: txn.region,
          locationCountry: txn.country,
          originalDescription: txn.originalDescription,
          source: txn.source,
          bankDirection: txn.bankDirection,
          historyMatch: txn.crossCheck,
        };
      }),
      totalBalance: accountRows.reduce(
        (sum, account) => sum + (account.currentBalance ?? 0),
        0,
      ),
      transactionCount: Number(stats[0]?.transactionCount ?? 0),
      earliestDate: stats[0]?.earliestDate ?? null,
      latestDate: stats[0]?.latestDate ?? null,
      latestStatementDate: statementStats[0]?.latestStatementDate ?? null,
    };

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Database unavailable. Run the flat rebuild script first.",
    };
  }
}
