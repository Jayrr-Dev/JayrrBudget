import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  ensureMerchant,
  linkTxnsToMerchant,
  merchantLabelFromTxn,
  merchantLogoSrc,
  updateMerchantOrMerge,
} from "./lib/ensureMerchant";
import { countTxnsForMerchant, retargetTxnMerchant } from "./lib/merchantTxnCount";
import { merchantSlug } from "./lib/merchantSlug";
import type { Doc, Id } from "./_generated/dataModel";

const merchantDoc = v.object({
  id: v.id("merchants"),
  slug: v.string(),
  name: v.string(),
  rawName: v.union(v.string(), v.null()),
  company: v.union(v.string(), v.null()),
  brand: v.union(v.string(), v.null()),
  website: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  logoSrc: v.union(v.string(), v.null()),
  transactionCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function toMerchantDoc(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"merchants">,
) {
  const createdAt = row.createdAt > 0 ? row.createdAt : (row._creationTime ?? 0);
  const updatedAt = row.updatedAt > 0 ? row.updatedAt : createdAt;
  return {
    id: row._id,
    slug: row.slug,
    name: row.name,
    rawName: row.rawName,
    company: row.company,
    brand: row.brand,
    website: row.website,
    logoUrl: row.logoUrl,
    logoSrc: await merchantLogoSrc(ctx, row),
    transactionCount: row.transactionCount ?? 0,
    createdAt,
    updatedAt,
  };
}

/** List merchants for the signed-in user (A-Z by name). */
export const list = query({
  args: {},
  returns: v.array(merchantDoc),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("merchants")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return await Promise.all(
      rows
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => toMerchantDoc(ctx, row)),
    );
  },
});

/**
 * Bundle for Next-side fuzzy resolve: unlabeled rows + labeled description
 * samples + merchant name probes.
 */
export const resolveCorpus = query({
  args: {
    transactionIds: v.optional(v.array(v.string())),
    unlabeledLimit: v.optional(v.number()),
    corpusLimit: v.optional(v.number()),
  },
  returns: v.object({
    unlabeled: v.array(
      v.object({
        transactionId: v.string(),
        description: v.string(),
        merchantClean: v.union(v.string(), v.null()),
      }),
    ),
    samples: v.array(
      v.object({
        description: v.string(),
        merchantId: v.id("merchants"),
        merchantClean: v.string(),
      }),
    ),
    merchants: v.array(merchantDoc),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const unlabeledLimit = Math.min(
      Math.max(args.unlabeledLimit ?? 200, 1),
      1000,
    );
    const corpusLimit = Math.min(Math.max(args.corpusLimit ?? 2000, 1), 5000);

    const merchants = await ctx.db
      .query("merchants")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const idFilter =
      args.transactionIds && args.transactionIds.length > 0
        ? new Set(args.transactionIds)
        : null;

    const unlabeled: Array<{
      transactionId: string;
      description: string;
      merchantClean: string | null;
    }> = [];
    const samples: Array<{
      description: string;
      merchantId: Id<"merchants">;
      merchantClean: string;
    }> = [];

    for (const txn of allTxns) {
      if (
        txn.merchantId != null &&
        txn.merchantClean?.trim() &&
        samples.length < corpusLimit
      ) {
        samples.push({
          description: txn.description,
          merchantId: txn.merchantId,
          merchantClean: txn.merchantClean.trim(),
        });
      }

      if (txn.merchantId != null) continue;
      if (idFilter && !idFilter.has(txn.transactionId)) continue;
      if (unlabeled.length >= unlabeledLimit) continue;
      unlabeled.push({
        transactionId: txn.transactionId,
        description: txn.description,
        merchantClean: txn.merchantClean ?? null,
      });
    }

    return {
      unlabeled,
      samples,
      merchants: await Promise.all(
        merchants
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((row) => toMerchantDoc(ctx, row)),
      ),
    };
  },
});

/** Create or update a merchant by canonical name. */
export const upsert = mutation({
  args: {
    name: v.string(),
    rawName: v.optional(v.union(v.string(), v.null())),
    company: v.optional(v.union(v.string(), v.null())),
    brand: v.optional(v.union(v.string(), v.null())),
    website: v.optional(v.union(v.string(), v.null())),
    logoUrl: v.optional(v.union(v.string(), v.null())),
  },
  returns: merchantDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ensureMerchant(ctx, user._id, {
      name: args.name,
      rawName: args.rawName,
      company: args.company,
      brand: args.brand,
      website: args.website,
      logoUrl: args.logoUrl,
    });
    return await toMerchantDoc(ctx, row);
  },
});

/** How many ledger rows an edit would update, including a same-name merge. */
export const editImpact = query({
  args: {
    merchantId: v.id("merchants"),
    name: v.string(),
  },
  returns: v.object({
    linkedCount: v.number(),
    merge: v.boolean(),
    mergeIntoName: v.union(v.string(), v.null()),
    affectedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.merchantId);
    if (!source || source.userId !== user._id) {
      throw new Error("Merchant not found");
    }

    const linked = await ctx.db
      .query("transactions")
      .withIndex("by_userId_merchantId", (q) =>
        q.eq("userId", user._id).eq("merchantId", source._id),
      )
      .collect();
    const linkedCount = linked.length;

    const slug = merchantSlug(args.name.trim());
    if (!slug) {
      return {
        linkedCount,
        merge: false,
        mergeIntoName: null,
        affectedCount: linkedCount,
      };
    }

    const clash = await ctx.db
      .query("merchants")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", user._id).eq("slug", slug),
      )
      .unique();

    if (!clash || clash._id === source._id) {
      return {
        linkedCount,
        merge: false,
        mergeIntoName: null,
        affectedCount: linkedCount,
      };
    }

    const keeperTxns = await ctx.db
      .query("transactions")
      .withIndex("by_userId_merchantId", (q) =>
        q.eq("userId", user._id).eq("merchantId", clash._id),
      )
      .collect();

    return {
      linkedCount,
      merge: true,
      mergeIntoName: clash.name,
      affectedCount: linkedCount + keeperTxns.length,
    };
  },
});

/** Upload URL for a merchant logo image. */
export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Edit merchant fields. Matching name/slug merges into the other payee and relinks rows. */
export const update = mutation({
  args: {
    merchantId: v.id("merchants"),
    name: v.string(),
    logoUrl: v.optional(v.union(v.string(), v.null())),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  returns: v.object({
    merchant: merchantDoc,
    merged: v.boolean(),
    mergedFromName: v.union(v.string(), v.null()),
    transactionsUpdated: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await updateMerchantOrMerge(ctx, user._id, args.merchantId, {
      name: args.name,
      logoUrl: args.logoUrl,
      logoStorageId: args.logoStorageId,
    });
    return {
      merchant: await toMerchantDoc(ctx, result.merchant),
      merged: result.merged,
      mergedFromName: result.mergedFromName,
      transactionsUpdated: result.transactionsUpdated,
    };
  },
});

/** Patch many owned transactions onto one merchant (denormalize clean name). */
export const linkTransactionsToMerchant = mutation({
  args: {
    merchantId: v.id("merchants"),
    transactionIds: v.array(v.string()),
  },
  returns: v.object({ linked: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.transactionIds.length === 0) {
      return { linked: 0 };
    }
    if (args.transactionIds.length > 500) {
      throw new Error("Can link at most 500 transactions at once");
    }

    const merchant = await ctx.db.get(args.merchantId);
    if (!merchant || merchant.userId !== user._id) {
      throw new Error("Merchant not found");
    }

    const linked = await linkTxnsToMerchant(
      ctx,
      user._id,
      merchant,
      args.transactionIds,
    );
    return { linked };
  },
});

/** Upsert merchant by name, then link transactions (AI invent path). */
export const upsertAndLink = mutation({
  args: {
    name: v.string(),
    rawName: v.optional(v.union(v.string(), v.null())),
    transactionIds: v.array(v.string()),
  },
  returns: v.object({
    merchant: merchantDoc,
    linked: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.transactionIds.length > 500) {
      throw new Error("Can link at most 500 transactions at once");
    }

    const merchant = await ensureMerchant(ctx, user._id, {
      name: args.name,
      rawName: args.rawName ?? null,
    });
    const linked = await linkTxnsToMerchant(
      ctx,
      user._id,
      merchant,
      args.transactionIds,
    );
    return { merchant: await toMerchantDoc(ctx, merchant), linked };
  },
});

/**
 * Build merchant rows from existing transaction merchant strings and link them.
 * Safe to re-run. Prefers rows still missing merchantId so batches drain the queue.
 * Only links rows that already have a label (no AI).
 */
export const backfillFromTransactions = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    scanned: v.number(),
    merchantsUpserted: v.number(),
    transactionsLinked: v.number(),
    skippedNoLabel: v.number(),
    remaining: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    const cursor = args.cursor ?? null;

    const page = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate({ numItems: limit, cursor });

    let skippedNoLabel = 0;
    let merchantsUpserted = 0;
    let transactionsLinked = 0;
    const upsertedSlugs = new Set<string>();

    for (const txn of page.page) {
      const label = merchantLabelFromTxn(txn);
      if (!label) {
        skippedNoLabel += 1;
        continue;
      }
      if (txn.merchantId != null) continue;

      const merchant = await ensureMerchant(ctx, user._id, {
        name: label,
        rawName: null,
        company: txn.company,
        brand: txn.brand,
        website: txn.website,
        logoUrl: txn.logoUrl,
      });

      if (!upsertedSlugs.has(merchant.slug)) {
        upsertedSlugs.add(merchant.slug);
        merchantsUpserted += 1;
      }

      await ctx.db.patch(txn._id, {
        merchantId: merchant._id,
        merchantClean: merchant.name,
        company: merchant.company ?? txn.company,
        brand: merchant.brand ?? txn.brand,
        website: merchant.website ?? txn.website,
        logoUrl: merchant.logoUrl ?? txn.logoUrl,
      });
      await retargetTxnMerchant(ctx, txn.merchantId, merchant._id);
      transactionsLinked += 1;
    }

    return {
      scanned: page.page.length,
      merchantsUpserted,
      transactionsLinked,
      skippedNoLabel,
      remaining: page.isDone ? 0 : 1,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/**
 * Recompute cached transactionCount from the merchantId index.
 * Paginated. Safe to re-run.
 */
export const syncTransactionCounts = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const page = await ctx.db
      .query("merchants")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    let updated = 0;
    for (const merchant of page.page) {
      const count = await countTxnsForMerchant(ctx, user._id, merchant._id);
      if (merchant.transactionCount !== count) {
        await ctx.db.patch(merchant._id, { transactionCount: count });
        updated += 1;
      }
    }

    return {
      scanned: page.page.length,
      updated,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
