import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  computeAnalysis,
  rangeStartDate,
} from "./lib/computeAnalysis";
import type {
  AnalysisPeriod,
  AnalysisRange,
  AnalysisSourceRow,
} from "./lib/analysisTypes";
import { requireRole } from "./lib/auth";

const RANGE_VALUES = ["1w", "1m", "3m", "6m", "12m", "all"] as const;
const PERIOD_VALUES = ["monthly", "biweekly", "weekly", "daily"] as const;

function parseRange(value: string): AnalysisRange {
  return (RANGE_VALUES as readonly string[]).includes(value)
    ? (value as AnalysisRange)
    : "12m";
}

function parsePeriod(value: string): AnalysisPeriod {
  return (PERIOD_VALUES as readonly string[]).includes(value)
    ? (value as AnalysisPeriod)
    : "monthly";
}

export const get = query({
  args: {
    range: v.optional(v.string()),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "premium");
    const range = parseRange(args.range ?? "12m");
    const period = parsePeriod(args.period ?? "monthly");

    const [txns, accounts] = await Promise.all([
      ctx.db
        .query("transactions")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    if (txns.length === 0) {
      return {
        ok: true as const,
        data: computeAnalysis({
          range,
          period,
          rows: [],
          earliestDate: null,
          latestDate: null,
        }),
      };
    }

    const accountById = new Map(
      accounts.map((account) => [
        account.accountId,
        { name: account.name, type: account.type },
      ]),
    );

    let earliestDate: string | null = null;
    let latestDate: string | null = null;
    for (const txn of txns) {
      const posted = txn.posted;
      if (!posted) continue;
      if (!earliestDate || posted < earliestDate) earliestDate = posted;
      if (!latestDate || posted > latestDate) latestDate = posted;
    }

    if (!latestDate) {
      return {
        ok: true as const,
        data: computeAnalysis({
          range,
          period,
          rows: [],
          earliestDate: null,
          latestDate: null,
        }),
      };
    }

    const startDate =
      range !== "all" ? rangeStartDate(latestDate, range) : null;

    const filteredTxns =
      startDate && range !== "all"
        ? txns.filter((txn) => txn.posted >= startDate)
        : txns;

    const rows: AnalysisSourceRow[] = filteredTxns.map((txn) => {
      const account = accountById.get(txn.accountId);
      return {
        description: txn.description,
        accountName: account?.name ?? txn.account ?? null,
        accountType: account?.type ?? null,
        amount: txn.amount,
        currencyCode: txn.currency,
        postedDate: txn.posted,
        authorizedDate: txn.authorized,
        categoryPrimary: txn.categoryPrimary,
        categoryDetailed: txn.categoryDetailed,
        transactionCode: txn.txnCode,
        paymentChannel: txn.channel,
        city: txn.city,
        region: txn.region,
        country: txn.country,
        merchantClean: txn.merchantClean,
        enrichmentChannel: txn.channel,
        sectionName: txn.section,
        categoryName: txn.category,
        typeName: txn.subcategory,
        spreadName: txn.spread,
        companyName: txn.company,
        brandName: txn.brand,
        tags: txn.tags,
        kind: txn.kind,
      };
    });

    return {
      ok: true as const,
      data: computeAnalysis({
        range,
        period,
        rows,
        earliestDate,
        latestDate,
      }),
    };
  },
});
