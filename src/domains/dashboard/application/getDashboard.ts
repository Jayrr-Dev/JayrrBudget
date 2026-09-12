import type { DashboardData } from "@/domains/dashboard/domain/types";
import {
  computeLoanAmortization,
  loadAllLoanTerms,
  loadPadCandidates,
  summaryFromAmortize,
} from "@/domains/loans/application/refreshLoanBalances";
import { getDb } from "@/shared/db";
import { cachedTursoRead } from "@/shared/db/readCache";
import {
  accounts,
  institutions,
  statementUploads,
  transactions,
} from "@/shared/db/schema";
import { count, desc, eq, max, min } from "drizzle-orm";

export type GetDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: number; error: string };

const DASHBOARD_CACHE_TTL_MS = 2 * 60_000;

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
  const transactionLimit = options?.transactionLimit;
  const limitKey =
    typeof transactionLimit === "number" &&
    Number.isFinite(transactionLimit) &&
    transactionLimit > 0
      ? String(transactionLimit)
      : "all";

  return cachedTursoRead({
    key: `dashboard:${limitKey}`,
    ttlMs: DASHBOARD_CACHE_TTL_MS,
    load: () =>
      loadDashboard(
        typeof transactionLimit === "number" ? transactionLimit : null,
      ),
    shouldCache: (result) => result.ok,
  });
}

async function loadDashboard(
  transactionLimit: number | null,
): Promise<GetDashboardResult> {
  try {
    const db = getDb();

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

    let loanSummariesByAccount = new Map<
      string,
      ReturnType<typeof summaryFromAmortize>
    >();
    try {
      const termsList = await loadAllLoanTerms();
      if (termsList.length > 0) {
        const pads = await loadPadCandidates(termsList[0]!.matchAmount);
        loanSummariesByAccount = new Map(
          termsList.map((terms) => {
            const result = computeLoanAmortization(terms, pads);
            return [
              terms.accountId,
              summaryFromAmortize(terms, result),
            ] as const;
          }),
        );
      }
    } catch {
      // loan_terms table may not exist yet — dashboard still works
      loanSummariesByAccount = new Map();
    }

    const data: DashboardData = {
      institutions: institutionRows,
      accounts: accountRows.map((account) => {
        const loanSummary =
          loanSummariesByAccount.get(account.accountId) ?? null;
        return {
          ...account,
          currentBalance:
            loanSummary?.remainingPrincipal ?? account.currentBalance,
          availableBalance:
            loanSummary?.remainingPrincipal ?? account.availableBalance,
          loanSummary,
        };
      }),
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
          spreadName: txn.spread,
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
      totalBalance: accountRows.reduce((sum, account) => {
        const loan = loanSummariesByAccount.get(account.accountId);
        return sum + (loan?.remainingPrincipal ?? account.currentBalance ?? 0);
      }, 0),
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
