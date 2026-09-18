import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { displayAccountName } from "@/domains/dashboard/domain/accountName";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";
import type { AnalysisSourceRow } from "@convex/lib/analysisTypes";
import { computeAnalysis } from "@convex/lib/computeAnalysis";
import { isoDay } from "@convex/lib/periods";
import { rewriteTaxonomyLabel } from "@convex/lib/seedCategoryPaths";

function toSourceRows(ledger: PrivateLedger): AnalysisSourceRow[] {
  const accountById = new Map(
    ledger.accounts.map((account) => [account.accountId, account]),
  );
  return ledger.transactions.map((tx) => {
    const account = tx.accountId ? accountById.get(tx.accountId) : undefined;
    return {
      description: tx.description,
      accountName: account
        ? displayAccountName(account)
        : (tx.accountId ?? null),
      accountType: account?.type ?? null,
      amount: tx.amount,
      currencyCode: tx.currency,
      postedDate: isoDay(tx.date),
      authorizedDate: tx.authorizedDate ?? null,
      transactionCode: tx.txnCode ?? null,
      paymentChannel: tx.channel ?? null,
      city: tx.city ?? null,
      region: tx.region ?? null,
      country: tx.country ?? null,
      merchantClean: tx.merchantClean ?? tx.merchantName ?? null,
      // Vault txs do not store enrichment channel / company / brand / kind.
      enrichmentChannel: null,
      sectionName: tx.sectionName ?? null,
      categoryName: rewriteTaxonomyLabel("category", tx.categoryName),
      typeName: rewriteTaxonomyLabel("subcategory", tx.subcategoryName),
      spreadName: tx.spreadName ?? null,
      companyName: null,
      brandName: null,
      tags: (tx.tagNames ?? []).join(","),
      kind: null,
    };
  });
}

export function analysisFromPrivateLedger(
  ledger: PrivateLedger,
  range: AnalysisRange,
  period: AnalysisPeriod,
): AnalysisData {
  const rows = toSourceRows(ledger);
  const dates = rows
    .map((row) => isoDay(row.postedDate))
    .filter((posted) => /^\d{4}-\d{2}-\d{2}$/.test(posted))
    .sort();
  return computeAnalysis({
    range,
    period,
    rows,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
  }) as AnalysisData;
}
