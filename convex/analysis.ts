import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  computeAnalysis,
  rangeStartDate,
} from "./lib/computeAnalysis";
import type {
  AnalysisPeriod,
  AnalysisRange,
  AnalysisSourceRow,
} from "./lib/analysisTypes";
import { requireUser } from "./lib/auth";

const rangeValidator = v.union(
  v.literal("1w"),
  v.literal("1m"),
  v.literal("3m"),
  v.literal("6m"),
  v.literal("12m"),
  v.literal("all"),
);

const periodValidator = v.union(
  v.literal("monthly"),
  v.literal("biweekly"),
  v.literal("weekly"),
  v.literal("daily"),
);

const PAGE_SIZE = 250;

function toSourceRow(
  txn: {
    description?: string | null;
    account?: string | null;
    accountId: string;
    amount: number;
    currency?: string | null;
    posted: string;
    authorized?: string | null;
    txnCode?: string | null;
    channel?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    merchantClean?: string | null;
    section?: string | null;
    category?: string | null;
    subcategory?: string | null;
    spread?: string | null;
    company?: string | null;
    brand?: string | null;
    tags?: string | null;
    kind?: string | null;
  },
  accountById: Map<string, { name: string; type: string }>,
): AnalysisSourceRow {
  const account = accountById.get(txn.accountId);
  return {
    description: txn.description ?? null,
    accountName: account?.name ?? txn.account ?? null,
    accountType: account?.type ?? null,
    amount: txn.amount,
    currencyCode: txn.currency ?? null,
    postedDate: txn.posted,
    authorizedDate: txn.authorized ?? null,
    transactionCode: txn.txnCode ?? null,
    paymentChannel: txn.channel ?? null,
    city: txn.city ?? null,
    region: txn.region ?? null,
    country: txn.country ?? null,
    merchantClean: txn.merchantClean ?? null,
    enrichmentChannel: txn.channel ?? null,
    sectionName: txn.section ?? null,
    categoryName: txn.category ?? null,
    typeName: txn.subcategory ?? null,
    spreadName: txn.spread ?? null,
    companyName: txn.company ?? null,
    brandName: txn.brand ?? null,
    tags: txn.tags ?? null,
    kind: null,
  };
}

/** Bounds + accounts. Auth checked here. */
export const loadMeta = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [latestTxn, earliestTxn, accounts] = await Promise.all([
      ctx.db
        .query("transactions")
        .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
        .order("desc")
        .first(),
      ctx.db
        .query("transactions")
        .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
        .order("asc")
        .first(),
      ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    return {
      latestDate: latestTxn?.posted ?? null,
      earliestDate: earliestTxn?.posted ?? null,
      accounts: accounts.map((account) => ({
        accountId: account.accountId,
        name: account.name,
        type: account.type,
      })),
    };
  },
});

/** One page of slim rows - stays under the 1s query limit. */
export const loadPage = internalQuery({
  args: {
    startDate: v.union(v.string(), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const page = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => {
        const byUser = q.eq("userId", user._id);
        return args.startDate
          ? byUser.gte("posted", args.startDate)
          : byUser;
      })
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: page.page.map((txn) => ({
        description: txn.description ?? null,
        account: txn.account ?? null,
        accountId: txn.accountId,
        amount: txn.amount,
        currency: txn.currency ?? null,
        posted: txn.posted,
        authorized: txn.authorized ?? null,
        txnCode: txn.txnCode ?? null,
        channel: txn.channel ?? null,
        city: txn.city ?? null,
        region: txn.region ?? null,
        country: txn.country ?? null,
        merchantClean: txn.merchantClean ?? null,
        section: txn.section ?? null,
        category: txn.category ?? null,
        subcategory: txn.subcategory ?? null,
        spread: txn.spread ?? null,
        company: txn.company ?? null,
        brand: txn.brand ?? null,
        tags: txn.tags ?? null,
        kind: null,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Analysis dashboard payload.
 * Action so compute is not capped at the 1s query limit.
 * Loads transactions in pages, then runs computeAnalysis.
 */
export const get = action({
  args: {
    range: v.optional(rangeValidator),
    period: v.optional(periodValidator),
  },
  handler: async (ctx, args) => {
    const range = (args.range ?? "12m") as AnalysisRange;
    const period = (args.period ?? "monthly") as AnalysisPeriod;

    const meta = await ctx.runQuery(internal.analysis.loadMeta, {});
    const latestDate = meta.latestDate;
    const earliestDate = meta.earliestDate;

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

    const accountById = new Map(
      meta.accounts.map((account) => [
        account.accountId,
        { name: account.name, type: account.type },
      ]),
    );

    const rows: AnalysisSourceRow[] = [];
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page = await ctx.runQuery(internal.analysis.loadPage, {
        startDate,
        paginationOpts: {
          numItems: PAGE_SIZE,
          cursor,
        },
      });
      for (const txn of page.page) {
        rows.push(toSourceRow(txn, accountById));
      }
      isDone = page.isDone;
      cursor = page.continueCursor;
    }

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
