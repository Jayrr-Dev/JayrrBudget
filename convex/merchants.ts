import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  ensureMerchant,
  merchantLabelFromTxn,
} from "./lib/ensureMerchant";

const merchantDoc = v.object({
  id: v.id("merchants"),
  slug: v.string(),
  name: v.string(),
  rawName: v.union(v.string(), v.null()),
  company: v.union(v.string(), v.null()),
  brand: v.union(v.string(), v.null()),
  website: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

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
    return rows
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({
        id: row._id,
        slug: row.slug,
        name: row.name,
        rawName: row.rawName,
        company: row.company,
        brand: row.brand,
        website: row.website,
        logoUrl: row.logoUrl,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
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
    return {
      id: row._id,
      slug: row.slug,
      name: row.name,
      rawName: row.rawName,
      company: row.company,
      brand: row.brand,
      website: row.website,
      logoUrl: row.logoUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

/**
 * Build merchant rows from existing transaction merchant strings and link them.
 * Safe to re-run. Processes up to `limit` transactions per call.
 */
export const backfillFromTransactions = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    merchantsUpserted: v.number(),
    transactionsLinked: v.number(),
    skippedNoLabel: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(limit);

    let merchantsUpserted = 0;
    let transactionsLinked = 0;
    let skippedNoLabel = 0;
    const upsertedSlugs = new Set<string>();

    for (const txn of txns) {
      const label = merchantLabelFromTxn(txn);
      if (!label) {
        skippedNoLabel += 1;
        continue;
      }

      const merchant = await ensureMerchant(ctx, user._id, {
        name: label,
        rawName: txn.merchantName,
        company: txn.company,
        brand: txn.brand,
        website: txn.website,
        logoUrl: txn.logoUrl,
      });

      if (!upsertedSlugs.has(merchant.slug)) {
        upsertedSlugs.add(merchant.slug);
        merchantsUpserted += 1;
      }

      const needsLink = txn.merchantId !== merchant._id;
      const needsSync =
        txn.merchantClean !== merchant.name ||
        (merchant.company != null && txn.company !== merchant.company) ||
        (merchant.brand != null && txn.brand !== merchant.brand);

      if (needsLink || needsSync) {
        await ctx.db.patch(txn._id, {
          merchantId: merchant._id,
          merchantClean: merchant.name,
          company: merchant.company ?? txn.company,
          brand: merchant.brand ?? txn.brand,
          website: merchant.website ?? txn.website,
          logoUrl: merchant.logoUrl ?? txn.logoUrl,
        });
        transactionsLinked += 1;
      }
    }

    return {
      scanned: txns.length,
      merchantsUpserted,
      transactionsLinked,
      skippedNoLabel,
    };
  },
});
