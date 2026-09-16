import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import type {
  AnalysisPeriod,
  AnalysisRange,
  AnalysisSourceRow,
} from "./lib/analysisTypes";
import type { ActionCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { computeAnalysis, rangeStartDate } from "./lib/computeAnalysis";
import { addDays, isoDay } from "./lib/periods";
import { rewriteTaxonomyLabel } from "./lib/seedCategoryPaths";

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

const PAGE_SIZE = 500;
const SHARD_MIN_DAYS = 60;
const SHARD_COUNT = 4;

type SlimTxn = {
  description: string | null;
  account: string | null;
  accountId: string;
  amount: number;
  currency: string | null;
  posted: string;
  authorized: string | null;
  txnCode: string | null;
  channel: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  merchantClean: string | null;
  section: string | null;
  category: string | null;
  subcategory: string | null;
  spread: string | null;
  company: string | null;
  brand: string | null;
  tags: string | null;
  kind: null;
};

type LoadPageResult = {
  page: SlimTxn[];
  isDone: boolean;
  continueCursor: string;
};

function analysisShards(
  startDate: string | null,
  latestDate: string,
  earliestDate: string | null,
): Array<{ startDate: string | null; endExclusive: string | null }> {
  const from = startDate ?? earliestDate;
  if (!from) return [{ startDate, endExclusive: null }];

  const fromDay = isoDay(from);
  const toDay = isoDay(latestDate);
  const fromMs = Date.parse(`${fromDay}T00:00:00Z`);
  const toMs = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return [{ startDate: fromDay, endExclusive: addDays(toDay, 1) }];
  }

  const spanDays = Math.round((toMs - fromMs) / 86_400_000) + 1;
  const shardCount = spanDays >= SHARD_MIN_DAYS ? SHARD_COUNT : 1;
  const shardLen = Math.ceil(spanDays / shardCount);
  const shards: Array<{
    startDate: string | null;
    endExclusive: string | null;
  }> = [];

  for (let i = 0; i < shardCount; i += 1) {
    const start = addDays(fromDay, i * shardLen);
    if (start > toDay) break;
    const endExclusive =
      i === shardCount - 1
        ? addDays(toDay, 1)
        : addDays(fromDay, (i + 1) * shardLen);
    shards.push({ startDate: start, endExclusive });
  }

  return shards.length > 0
    ? shards
    : [{ startDate: fromDay, endExclusive: addDays(toDay, 1) }];
}

async function loadShard(
  ctx: ActionCtx,
  startDate: string | null,
  endExclusive: string | null,
  accountById: Map<string, { name: string; type: string }>,
): Promise<AnalysisSourceRow[]> {
  const rows: AnalysisSourceRow[] = [];
  let cursor: string | null = null;
  let isDone = false;

  while (!isDone) {
    const page = (await ctx.runQuery(internal.analysis.loadPage, {
      startDate,
      endExclusive,
      paginationOpts: {
        numItems: PAGE_SIZE,
        cursor,
      },
    })) as LoadPageResult;
    for (const txn of page.page) {
      rows.push(toSourceRow(txn, accountById));
    }
    isDone = page.isDone;
    cursor = page.continueCursor;
  }

  return rows;
}

function toSourceRow(
  txn: SlimTxn,
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
    categoryName: rewriteTaxonomyLabel("category", txn.category),
    typeName: rewriteTaxonomyLabel("subcategory", txn.subcategory),
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
    endExclusive: v.optional(v.union(v.string(), v.null())),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<LoadPageResult> => {
    const user = await requireUser(ctx);
    const endExclusive = args.endExclusive ?? null;

    const page = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => {
        const byUser = q.eq("userId", user._id);
        if (args.startDate && endExclusive) {
          return byUser.gte("posted", args.startDate).lt("posted", endExclusive);
        }
        if (args.startDate) return byUser.gte("posted", args.startDate);
        if (endExclusive) return byUser.lt("posted", endExclusive);
        return byUser;
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

    const meta: any = await ctx.runQuery(internal.analysis.loadMeta, {});
    const latestDate = meta.latestDate;
    const earliestDate: string | null = meta.earliestDate;

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

    const accountById = new Map<string, { name: string; type: string }>(
      meta.accounts.map(
        (account: { accountId: string; name: string; type: string }) => [
          account.accountId,
          { name: account.name, type: account.type },
        ],
      ),
    );

    const shards = analysisShards(startDate, latestDate, earliestDate);
    const shardRows = await Promise.all(
      shards.map((shard) =>
        loadShard(ctx, shard.startDate, shard.endExclusive, accountById),
      ),
    );
    // Newest shard first so computeAnalysis peeks keep recent txns.
    const rows = shardRows.toReversed().flat();

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
