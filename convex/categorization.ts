import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { descriptionKey, isCategorized, normalizedLabel, profileValidator, taxonomyKey } from "./lib/categorization";
import { ensureMerchant } from "./lib/ensureMerchant";
import { SEED_CATEGORY_PATHS } from "./lib/seedCategoryPaths";
import { TXN_CODES } from "./lib/txnCodes";
import { SPREAD_NAMES } from "./lib/spreads";

async function publishPath(ctx: MutationCtx, section: string, category: string, subcategory: string | null) {
  if (!section.trim() || !category.trim()) return;
  const key = taxonomyKey(section, category, subcategory);
  const existing = await ctx.db.query("sharedCategoryPaths").withIndex("by_key", q => q.eq("key", key)).unique();
  if (!existing) await ctx.db.insert("sharedCategoryPaths", { key, section, category, subcategory });
}

// Run once at rollout, paginated by the CLI. Only module names cross owners.
export const seedVocabulary = internalMutation({
  args: { table: v.union(v.literal("transactionCategories"), v.literal("transactionSubcategories")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query(args.table).paginate(args.paginationOpts);
    for (const row of result.page) {
      const category = "sectionLegacyId" in row ? row : row.categoryLegacyId == null ? null :
        await ctx.db.query("transactionCategories").withIndex("by_userId_legacyId", q => q.eq("userId", row.userId).eq("legacyId", row.categoryLegacyId!)).first();
      if (!category || category.sectionLegacyId == null) continue;
      const section = await ctx.db.query("transactionSections").withIndex("by_userId_legacyId", q => q.eq("userId", category.userId).eq("legacyId", category.sectionLegacyId!)).first();
      if (section) await publishPath(ctx, section.name, category.name, "categoryLegacyId" in row ? row.name : null);
    }
    return { isDone: result.isDone, continueCursor: result.continueCursor, scanned: result.page.length };
  },
});

export const publishOwnVocabulary = mutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    const user = await requireUser(ctx);
    for (const path of SEED_CATEGORY_PATHS) {
      await publishPath(ctx, path.section, path.category, path.subcategory);
    }
    const sections = await ctx.db.query("transactionSections").withIndex("by_userId", q => q.eq("userId", user._id)).collect();
    const categories = await ctx.db.query("transactionCategories").withIndex("by_userId", q => q.eq("userId", user._id)).collect();
    const subs = await ctx.db.query("transactionSubcategories").withIndex("by_userId", q => q.eq("userId", user._id)).collect();
    for (const category of categories) {
      const section = sections.find(s => s.legacyId === category.sectionLegacyId);
      if (!section) continue;
      await publishPath(ctx, section.name, category.name, null);
      for (const sub of subs.filter(s => s.categoryLegacyId === category.legacyId)) {
        await publishPath(ctx, section.name, category.name, sub.name);
      }
    }
    return null;
  },
});

export const vocabulary = query({
  args: {},
  returns: v.object({
    paths: v.array(v.object({
      key: v.string(),
      section: v.string(),
      category: v.string(),
      subcategory: v.union(v.string(), v.null()),
    })),
    types: v.array(v.string()),
    spreads: v.array(v.string()),
  }),
  handler: async ctx => {
    const user = await requireUser(ctx);
    const types = await ctx.db.query("transactionTypes").withIndex("by_userId", q => q.eq("userId", user._id)).collect();
    const spreads = await ctx.db.query("transactionSpreads").withIndex("by_userId", q => q.eq("userId", user._id)).collect();
    const paths = await ctx.db.query("sharedCategoryPaths").collect();
    return {
      paths: paths.map(({ key, section, category, subcategory }) => ({ key, section, category, subcategory })),
      types: [...new Set(types.length ? types.map(t => t.name) : ["Expense", "Income", "Transfer"])],
      spreads: [...new Set([...SPREAD_NAMES, ...spreads.map(s => s.name)])],
    };
  },
});

export const pendingPage = query({
  args: {
    uploadId: v.number(),
    paginationOpts: paginationOptsValidator,
    /** When true, include already-labeled rows (recategorize / upload rules refresh). */
    includeAll: v.optional(v.boolean()),
  },
  returns: v.object({
    page: v.array(v.object({
      transactionId: v.string(),
      description: v.string(),
      amount: v.number(),
      updatedAt: v.number(),
      key: v.string(),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const upload = await ctx.db.query("statementUploads").withIndex("by_userId_uploadId", q => q.eq("userId", user._id).eq("uploadId", args.uploadId)).unique();
    if (!upload) throw new Error("Statement not found");
    // One statement is a bounded set. Collect then filter so categorized rows
    // cannot empty a page and hide later unlabeled lines.
    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_statementUploadId", (q) =>
        q.eq("userId", user._id).eq("statementUploadId", args.uploadId),
      )
      .collect();
    const page = args.includeAll
      ? rows
      : rows.filter((t) => !isCategorized(t));
    return {
      page: page.map((t) => ({
        transactionId: t.transactionId,
        description: t.description,
        amount: t.amount,
        updatedAt: t.updatedAt,
        key: descriptionKey(t.description, t.amount),
      })),
      isDone: true,
      continueCursor: "",
    };
  },
});

export const lookup = query({
  args: { keys: v.array(v.string()) },
  returns: v.array(v.object({
    key: v.string(),
    profile: v.union(profileValidator, v.null()),
  })),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.keys.length > 100) throw new Error("Too many keys");
    return Promise.all(args.keys.map(async key => {
      const rule = await ctx.db.query("categorizationRules").withIndex("by_userId_key", q => q.eq("userId", user._id).eq("key", key)).unique();
      return { key, profile: rule?.profile ?? null };
    }));
  },
});

async function moduleWriter(ctx: MutationCtx, userId: Id<"users">) {
  const sections = await ctx.db.query("transactionSections").withIndex("by_userId", q => q.eq("userId", userId)).collect();
  const categories = await ctx.db.query("transactionCategories").withIndex("by_userId", q => q.eq("userId", userId)).collect();
  const subs = await ctx.db.query("transactionSubcategories").withIndex("by_userId", q => q.eq("userId", userId)).collect();
  const spreads = await ctx.db.query("transactionSpreads").withIndex("by_userId", q => q.eq("userId", userId)).collect();
  const types = await ctx.db.query("transactionTypes").withIndex("by_userId", q => q.eq("userId", userId)).collect();
  const next = (rows: { legacyId: number }[]) => Math.max(0, ...rows.map(r => r.legacyId)) + 1;
  const equal = (a: string, b: string) => normalizedLabel(a) === normalizedLabel(b);
  return async (path: { section: string; category: string; subcategory: string | null }, spread: string, transactionType: string) => {
    let section = sections.find(r => equal(r.name, path.section));
    if (!section) {
      const id = await ctx.db.insert("transactionSections", { userId, legacyId: next(sections), name: path.section, description: "" });
      section = (await ctx.db.get(id))!; sections.push(section);
    }
    let category = categories.find(r => equal(r.name, path.category) && r.sectionLegacyId === section!.legacyId);
    if (!category) {
      const id = await ctx.db.insert("transactionCategories", { userId, legacyId: next(categories), name: path.category, sectionLegacyId: section.legacyId, description: "" });
      category = (await ctx.db.get(id))!; categories.push(category);
    }
    let sub = subs.find(r => path.subcategory != null && equal(r.name, path.subcategory) && r.categoryLegacyId === category!.legacyId);
    if (path.subcategory && !sub) {
      const id = await ctx.db.insert("transactionSubcategories", { userId, legacyId: next(subs), name: path.subcategory, categoryLegacyId: category.legacyId, description: "" });
      sub = (await ctx.db.get(id))!; subs.push(sub);
    }
    let spreadRow = spreads.find(r => equal(r.name, spread));
    if (!spreadRow) {
      if (!(SPREAD_NAMES as readonly string[]).includes(spread)) throw new Error("Unknown spread");
      const id = await ctx.db.insert("transactionSpreads", { userId, legacyId: next(spreads), name: spread, description: "", targetPercent: spread === "Needs" ? 50 : spread === "Wants" ? 30 : spread === "Savings" ? 20 : 0, sortOrder: spreads.length });
      spreadRow = (await ctx.db.get(id))!; spreads.push(spreadRow);
    }
    let type = types.find(r => equal(r.name, transactionType));
    if (!type) {
      if (!["Expense", "Income", "Transfer"].includes(transactionType)) throw new Error("Unknown transaction type");
      const id = await ctx.db.insert("transactionTypes", { userId, legacyId: next(types), name: transactionType, description: "" });
      type = (await ctx.db.get(id))!; types.push(type);
    }
    return { sectionLegacyId: section.legacyId, categoryLegacyId: category.legacyId,
      subcategoryLegacyId: sub?.legacyId ?? null, spreadLegacyId: spreadRow.legacyId, transactionTypeLegacyId: type.legacyId };
  };
}

export const apply = mutation({
  args: {
    groups: v.array(v.object({ key: v.string(), profile: profileValidator,
      rows: v.array(v.object({ transactionId: v.string(), updatedAt: v.number() })) })),
    /** When true, overwrite rows that already have a category (recategorize). */
    overwrite: v.optional(v.boolean()),
  },
  returns: v.object({ applied: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.groups.length > 40 || args.groups.reduce((n, g) => n + g.rows.length, 0) > 200) throw new Error("Batch too large");
    const modules = await moduleWriter(ctx, user._id);
    let applied = 0;
    for (const group of args.groups) {
      const p = group.profile;
      if (!p.merchant.trim() || p.merchant.length > 160 || !(TXN_CODES as readonly string[]).includes(p.txnCode) || !["online", "in_store", "other"].includes(p.channel)) throw new Error("Invalid categorization");
      const path = await ctx.db.query("sharedCategoryPaths").withIndex("by_key", q => q.eq("key", p.pathKey)).unique();
      if (!path) throw new Error("Choose an existing category path");
      let groupApplied = 0;
      const ids = await modules(path, p.spread, p.transactionType);
      const merchant = await ensureMerchant(ctx, user._id, { name: p.merchant });
      for (const input of group.rows) {
        const row = await ctx.db.query("transactions").withIndex("by_userId_transactionId", q => q.eq("userId", user._id).eq("transactionId", input.transactionId)).unique();
        if (!row || row.updatedAt !== input.updatedAt) continue;
        if (!args.overwrite && isCategorized(row)) continue;
        if (descriptionKey(row.description, row.amount) !== group.key) throw new Error("Description changed");
        await ctx.db.patch(row._id, { ...ids, merchantId: merchant._id, merchantClean: merchant.name,
          section: path.section, category: path.category, subcategory: path.subcategory,
          spread: p.spread, transactionType: p.transactionType, txnCode: p.txnCode, channel: p.channel, updatedAt: Date.now() });
        groupApplied++; applied++;
      }
      if (groupApplied) {
        const rule = await ctx.db.query("categorizationRules").withIndex("by_userId_key", q => q.eq("userId", user._id).eq("key", group.key)).unique();
        if (rule) await ctx.db.patch(rule._id, { profile: p, updatedAt: Date.now() });
        else await ctx.db.insert("categorizationRules", { userId: user._id, key: group.key, profile: p, updatedAt: Date.now() });
      }
    }
    return { applied };
  },
});

/** Overwrite one owned row and refresh its description-key rule. */
export const recategorize = mutation({
  args: {
    transactionId: v.string(),
    profile: profileValidator,
  },
  returns: v.object({ applied: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("transactions")
      .withIndex("by_userId_transactionId", (q) =>
        q.eq("userId", user._id).eq("transactionId", args.transactionId),
      )
      .unique();
    if (!row) throw new Error("Transaction not found");
    const p = args.profile;
    if (
      !p.merchant.trim() ||
      p.merchant.length > 160 ||
      !(TXN_CODES as readonly string[]).includes(p.txnCode) ||
      !["online", "in_store", "other"].includes(p.channel)
    ) {
      throw new Error("Invalid categorization");
    }
    const path = await ctx.db
      .query("sharedCategoryPaths")
      .withIndex("by_key", (q) => q.eq("key", p.pathKey))
      .unique();
    if (!path) throw new Error("Choose an existing category path");
    const modules = await moduleWriter(ctx, user._id);
    const ids = await modules(path, p.spread, p.transactionType);
    const merchant = await ensureMerchant(ctx, user._id, { name: p.merchant });
    const key = descriptionKey(row.description, row.amount);
    await ctx.db.patch(row._id, {
      ...ids,
      merchantId: merchant._id,
      merchantClean: merchant.name,
      section: path.section,
      category: path.category,
      subcategory: path.subcategory,
      spread: p.spread,
      transactionType: p.transactionType,
      txnCode: p.txnCode,
      channel: p.channel,
      updatedAt: Date.now(),
    });
    const rule = await ctx.db
      .query("categorizationRules")
      .withIndex("by_userId_key", (q) => q.eq("userId", user._id).eq("key", key))
      .unique();
    if (rule) await ctx.db.patch(rule._id, { profile: p, updatedAt: Date.now() });
    else await ctx.db.insert("categorizationRules", { userId: user._id, key, profile: p, updatedAt: Date.now() });
    return { applied: 1 };
  },
});
