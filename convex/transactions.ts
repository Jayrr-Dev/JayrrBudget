import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { ensureUser, requireUser } from "./lib/auth";
import { rememberCategorization } from "./lib/categorizationMemory";
import { classifySpread } from "./lib/spreads";
import { hasTag, joinTags, splitTags } from "./lib/tags";
import { taxonomyDescription } from "./lib/taxonomyDescriptions";

const TAXONOMY_FIELDS = [
  "section",
  "spread",
  "category",
  "subcategory",
] as const;

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export const taxonomy = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [sections, spreads, categories, subcategories] = await Promise.all([
      ctx.db
        .query("transactionSections")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("transactionSpreads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("transactionCategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const sectionByLegacy = new Map(
      sections.map((row) => [row.legacyId, row.name]),
    );
    const categoryByLegacy = new Map(
      categories.map((row) => [row.legacyId, row.name]),
    );

    return {
      sections: sections
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
        })),
      spreads: spreads
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
        })),
      categories: categories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
          sectionId: row.sectionLegacyId,
          sectionName:
            row.sectionLegacyId == null
              ? null
              : (sectionByLegacy.get(row.sectionLegacyId) ?? null),
        })),
      subcategories: subcategories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
          categoryId: row.categoryLegacyId,
          categoryName:
            row.categoryLegacyId == null
              ? null
              : (categoryByLegacy.get(row.categoryLegacyId) ?? null),
        })),
    };
  },
});

async function nextLegacyId(
  ctx: MutationCtx,
  table:
    | "transactionSections"
    | "transactionSpreads"
    | "transactionCategories"
    | "transactionSubcategories",
  userId: Id<"users">,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return rows.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
}

type NamedTaxonomyPath = {
  section: string | null;
  sectionLegacyId: number | null;
  category: string | null;
  categoryLegacyId: number | null;
  subcategory: string | null;
  subcategoryLegacyId: number | null;
  spread: string | null;
  spreadLegacyId: number | null;
};

async function resolveNamedTaxonomyPath(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: {
    section: string | null;
    category: string | null;
    subcategory: string | null;
  },
): Promise<NamedTaxonomyPath> {
  const sectionName = input.section?.trim() || null;
  const categoryName = input.category?.trim() || null;
  const subcategoryName = input.subcategory?.trim() || null;

  let section: string | null = null;
  let sectionLegacyId: number | null = null;
  let category: string | null = null;
  let categoryLegacyId: number | null = null;
  let subcategory: string | null = null;
  let subcategoryLegacyId: number | null = null;

  if (sectionName) {
    const all = await ctx.db
      .query("transactionSections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const existing = all.find((row) => norm(row.name) === norm(sectionName));
    if (existing) {
      section = existing.name;
      sectionLegacyId = existing.legacyId;
    } else {
      const legacyId = await nextLegacyId(ctx, "transactionSections", userId);
      const trimmed = sectionName.trim();
      await ctx.db.insert("transactionSections", {
        userId,
        legacyId,
        name: trimmed,
        description: taxonomyDescription("section", trimmed),
      });
      section = trimmed;
      sectionLegacyId = legacyId;
    }
  }

  if (categoryName) {
    const all = await ctx.db
      .query("transactionCategories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const existing = all.find((row) => norm(row.name) === norm(categoryName));
    if (existing) {
      if (existing.sectionLegacyId == null && sectionLegacyId != null) {
        await ctx.db.patch(existing._id, { sectionLegacyId });
      }
      category = existing.name;
      categoryLegacyId = existing.legacyId;
      if (sectionLegacyId == null && existing.sectionLegacyId != null) {
        const sections = await ctx.db
          .query("transactionSections")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect();
        const parent = sections.find(
          (row) => row.legacyId === existing.sectionLegacyId,
        );
        if (parent) {
          section = parent.name;
          sectionLegacyId = parent.legacyId;
        }
      }
    } else {
      const legacyId = await nextLegacyId(ctx, "transactionCategories", userId);
      const trimmed = categoryName.trim();
      await ctx.db.insert("transactionCategories", {
        userId,
        legacyId,
        name: trimmed,
        sectionLegacyId,
        description: taxonomyDescription("category", trimmed),
      });
      category = trimmed;
      categoryLegacyId = legacyId;
    }
  }

  if (subcategoryName) {
    const all = await ctx.db
      .query("transactionSubcategories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const existing = all.find(
      (row) => norm(row.name) === norm(subcategoryName),
    );
    if (existing) {
      if (existing.categoryLegacyId == null && categoryLegacyId != null) {
        await ctx.db.patch(existing._id, { categoryLegacyId });
      }
      subcategory = existing.name;
      subcategoryLegacyId = existing.legacyId;
      if (categoryLegacyId == null && existing.categoryLegacyId != null) {
        const categories = await ctx.db
          .query("transactionCategories")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect();
        const parentCat = categories.find(
          (row) => row.legacyId === existing.categoryLegacyId,
        );
        if (parentCat) {
          category = parentCat.name;
          categoryLegacyId = parentCat.legacyId;
          if (sectionLegacyId == null && parentCat.sectionLegacyId != null) {
            const sections = await ctx.db
              .query("transactionSections")
              .withIndex("by_userId", (q) => q.eq("userId", userId))
              .collect();
            const parentSec = sections.find(
              (row) => row.legacyId === parentCat.sectionLegacyId,
            );
            if (parentSec) {
              section = parentSec.name;
              sectionLegacyId = parentSec.legacyId;
            }
          }
        }
      }
    } else {
      const legacyId = await nextLegacyId(
        ctx,
        "transactionSubcategories",
        userId,
      );
      const trimmed = subcategoryName.trim();
      await ctx.db.insert("transactionSubcategories", {
        userId,
        legacyId,
        name: trimmed,
        categoryLegacyId,
        description: taxonomyDescription("subcategory", trimmed),
      });
      subcategory = trimmed;
      subcategoryLegacyId = legacyId;
    }
  }

  const nextSpread = classifySpread({ section, category, subcategory });
  let spread: string | null = null;
  let spreadLegacyId: number | null = null;
  if (nextSpread) {
    const all = await ctx.db
      .query("transactionSpreads")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const existing = all.find((row) => norm(row.name) === norm(nextSpread));
    if (existing) {
      spread = existing.name;
      spreadLegacyId = existing.legacyId;
    } else {
      const legacyId = await nextLegacyId(ctx, "transactionSpreads", userId);
      await ctx.db.insert("transactionSpreads", {
        userId,
        legacyId,
        name: nextSpread,
        targetPercent: 0,
        description: "Custom",
        sortOrder: 100,
      });
      spread = nextSpread;
      spreadLegacyId = legacyId;
    }
  }

  return {
    section,
    sectionLegacyId,
    category,
    categoryLegacyId,
    subcategory,
    subcategoryLegacyId,
    spread,
    spreadLegacyId,
  };
}

export const addTag = mutation({
  args: {
    transactionId: v.string(),
    tag: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const transactionId = args.transactionId.trim();
    const tag = args.tag.trim();
    if (!transactionId) throw new Error("transactionId is required");
    if (!tag) throw new Error("Tag name is required");

    const row = await ctx.db
      .query("transactions")
      .withIndex("by_userId_transactionId", (q) =>
        q.eq("userId", user._id).eq("transactionId", transactionId),
      )
      .unique();
    if (!row) throw new Error("Transaction not found");

    const tags = splitTags(row.tags);
    if (hasTag(tags, tag)) {
      return { transactionId, tag, tags, added: false };
    }
    tags.push(tag);
    await ctx.db.patch(row._id, {
      tags: joinTags(tags),
      updatedAt: Date.now(),
    });
    return { transactionId, tag, tags, added: true };
  },
});

export const tagByDateRange = mutation({
  args: {
    tag: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    excludeTransactionIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tag = args.tag.trim();
    const startDate = args.startDate.trim();
    const endDate = args.endDate.trim();
    if (!tag) throw new Error("Tag name is required");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      throw new Error("Dates must be YYYY-MM-DD");
    }
    if (startDate > endDate) {
      throw new Error("Start date must be on or before end date");
    }

    const exclude = new Set(
      (args.excludeTransactionIds ?? []).map((id) => id.trim()).filter(Boolean),
    );

    const matchedRows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) =>
        q
          .eq("userId", user._id)
          .gte("posted", startDate)
          .lte("posted", endDate),
      )
      .collect();

    const candidates = matchedRows.filter(
      (row) => !exclude.has(row.transactionId),
    );

    let updated = 0;
    const now = Date.now();
    for (const row of candidates) {
      const tags = splitTags(row.tags);
      if (hasTag(tags, tag)) continue;
      tags.push(tag);
      await ctx.db.patch(row._id, {
        tags: joinTags(tags),
        updatedAt: now,
      });
      updated += 1;
    }

    return {
      matched: candidates.length,
      updated,
      excluded: exclude.size,
      tag,
      startDate,
      endDate,
    };
  },
});

export const updateTaxonomy = mutation({
  args: {
    transactionId: v.string(),
    field: v.union(
      v.literal("section"),
      v.literal("spread"),
      v.literal("category"),
      v.literal("subcategory"),
    ),
    value: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await ensureUser(ctx);
    const transactionId = args.transactionId.trim();
    if (!transactionId) throw new Error("transactionId is required");
    if (!(TAXONOMY_FIELDS as readonly string[]).includes(args.field)) {
      throw new Error(
        "field must be section, spread, category, or subcategory",
      );
    }

    const rawValue = args.value?.trim() || null;
    const row = await ctx.db
      .query("transactions")
      .withIndex("by_userId_transactionId", (q) =>
        q.eq("userId", user._id).eq("transactionId", transactionId),
      )
      .unique();
    if (!row) throw new Error("Transaction not found");

    let section = row.section;
    let sectionLegacyId = row.sectionLegacyId;
    let category = row.category;
    let categoryLegacyId = row.categoryLegacyId;
    let subcategory = row.subcategory;
    let subcategoryLegacyId = row.subcategoryLegacyId;
    let spread = row.spread;
    let spreadLegacyId = row.spreadLegacyId;
    const editingSpread = args.field === "spread";

    const ensureSection = async (name: string) => {
      const all = await ctx.db
        .query("transactionSections")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const existing = all.find((r) => norm(r.name) === norm(name));
      if (existing) return existing;
      const legacyId = await nextLegacyId(ctx, "transactionSections", user._id);
      const trimmed = name.trim();
      const id = await ctx.db.insert("transactionSections", {
        userId: user._id,
        legacyId,
        name: trimmed,
        description: taxonomyDescription("section", trimmed),
      });
      return { _id: id, legacyId, name: trimmed };
    };

    const ensureSpread = async (name: string) => {
      const all = await ctx.db
        .query("transactionSpreads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const existing = all.find((r) => norm(r.name) === norm(name));
      if (existing) return existing;
      const legacyId = await nextLegacyId(ctx, "transactionSpreads", user._id);
      const id = await ctx.db.insert("transactionSpreads", {
        userId: user._id,
        legacyId,
        name: name.trim(),
        targetPercent: 0,
        description: "Custom",
        sortOrder: 100,
      });
      return { _id: id, legacyId, name: name.trim() };
    };

    const ensureCategory = async (name: string, sectionId: number | null) => {
      const all = await ctx.db
        .query("transactionCategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const existing = all.find((r) => norm(r.name) === norm(name));
      if (existing) {
        if (existing.sectionLegacyId == null && sectionId != null) {
          await ctx.db.patch(existing._id, { sectionLegacyId: sectionId });
          return { ...existing, sectionLegacyId: sectionId };
        }
        return existing;
      }
      const legacyId = await nextLegacyId(
        ctx,
        "transactionCategories",
        user._id,
      );
      const trimmed = name.trim();
      const id = await ctx.db.insert("transactionCategories", {
        userId: user._id,
        legacyId,
        name: trimmed,
        sectionLegacyId: sectionId,
        description: taxonomyDescription("category", trimmed),
      });
      return {
        _id: id,
        legacyId,
        name: trimmed,
        sectionLegacyId: sectionId,
      };
    };

    const ensureSubcategory = async (
      name: string,
      categoryId: number | null,
    ) => {
      const all = await ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const existing = all.find((r) => norm(r.name) === norm(name));
      if (existing) {
        if (existing.categoryLegacyId == null && categoryId != null) {
          await ctx.db.patch(existing._id, { categoryLegacyId: categoryId });
          return { ...existing, categoryLegacyId: categoryId };
        }
        return existing;
      }
      const legacyId = await nextLegacyId(
        ctx,
        "transactionSubcategories",
        user._id,
      );
      const trimmed = name.trim();
      const id = await ctx.db.insert("transactionSubcategories", {
        userId: user._id,
        legacyId,
        name: trimmed,
        categoryLegacyId: categoryId,
        description: taxonomyDescription("subcategory", trimmed),
      });
      return {
        _id: id,
        legacyId,
        name: trimmed,
        categoryLegacyId: categoryId,
      };
    };

    const findSectionById = async (id: number) => {
      const all = await ctx.db
        .query("transactionSections")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      return all.find((r) => r.legacyId === id) ?? null;
    };
    const findCategoryById = async (id: number) => {
      const all = await ctx.db
        .query("transactionCategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      return all.find((r) => r.legacyId === id) ?? null;
    };
    const findCategoryByName = async (name: string) => {
      const all = await ctx.db
        .query("transactionCategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      return all.find((r) => norm(r.name) === norm(name)) ?? null;
    };
    const findSubcategoryById = async (id: number) => {
      const all = await ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      return all.find((r) => r.legacyId === id) ?? null;
    };
    const findSubcategoryByName = async (name: string) => {
      const all = await ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      return all.find((r) => norm(r.name) === norm(name)) ?? null;
    };

    if (args.field === "section") {
      if (!rawValue) {
        section = null;
        sectionLegacyId = null;
        category = null;
        categoryLegacyId = null;
        subcategory = null;
        subcategoryLegacyId = null;
      } else {
        const match = await ensureSection(rawValue);
        section = match.name;
        sectionLegacyId = match.legacyId;
        if (categoryLegacyId != null) {
          const cat = await findCategoryById(categoryLegacyId);
          if (
            !cat ||
            (cat.sectionLegacyId != null &&
              cat.sectionLegacyId !== sectionLegacyId)
          ) {
            category = null;
            categoryLegacyId = null;
            subcategory = null;
            subcategoryLegacyId = null;
          }
        } else if (category && norm(category)) {
          const cat = await findCategoryByName(category);
          if (
            !cat ||
            (cat.sectionLegacyId != null &&
              cat.sectionLegacyId !== sectionLegacyId)
          ) {
            category = null;
            categoryLegacyId = null;
            subcategory = null;
            subcategoryLegacyId = null;
          }
        }
      }
    } else if (args.field === "category") {
      if (!rawValue) {
        category = null;
        categoryLegacyId = null;
        subcategory = null;
        subcategoryLegacyId = null;
      } else {
        const match = await ensureCategory(rawValue, sectionLegacyId);
        category = match.name;
        categoryLegacyId = match.legacyId;
        if (match.sectionLegacyId != null) {
          const parent = await findSectionById(match.sectionLegacyId);
          if (parent) {
            section = parent.name;
            sectionLegacyId = parent.legacyId;
          }
        }
        if (subcategoryLegacyId != null) {
          const sub = await findSubcategoryById(subcategoryLegacyId);
          if (
            !sub ||
            (sub.categoryLegacyId != null &&
              sub.categoryLegacyId !== categoryLegacyId)
          ) {
            subcategory = null;
            subcategoryLegacyId = null;
          }
        } else if (subcategory && norm(subcategory)) {
          const sub = await findSubcategoryByName(subcategory);
          if (
            !sub ||
            (sub.categoryLegacyId != null &&
              sub.categoryLegacyId !== categoryLegacyId)
          ) {
            subcategory = null;
            subcategoryLegacyId = null;
          }
        }
      }
    } else if (args.field === "subcategory") {
      if (!rawValue) {
        subcategory = null;
        subcategoryLegacyId = null;
      } else {
        const match = await ensureSubcategory(rawValue, categoryLegacyId);
        subcategory = match.name;
        subcategoryLegacyId = match.legacyId;
        if (match.categoryLegacyId != null) {
          const parentCat = await findCategoryById(match.categoryLegacyId);
          if (parentCat) {
            category = parentCat.name;
            categoryLegacyId = parentCat.legacyId;
            if (parentCat.sectionLegacyId != null) {
              const parentSec = await findSectionById(
                parentCat.sectionLegacyId,
              );
              if (parentSec) {
                section = parentSec.name;
                sectionLegacyId = parentSec.legacyId;
              }
            }
          }
        }
      }
    } else if (args.field === "spread") {
      if (!rawValue) {
        spread = null;
        spreadLegacyId = null;
      } else {
        const match = await ensureSpread(rawValue);
        spread = match.name;
        spreadLegacyId = match.legacyId;
      }
    }

    if (!editingSpread) {
      const nextSpread = classifySpread({ section, category, subcategory });
      if (nextSpread) {
        const match = await ensureSpread(nextSpread);
        spread = match.name;
        spreadLegacyId = match.legacyId;
      } else {
        spread = null;
        spreadLegacyId = null;
      }
    }

    await ctx.db.patch(row._id, {
      section,
      sectionLegacyId,
      category,
      categoryLegacyId,
      subcategory,
      subcategoryLegacyId,
      spread,
      spreadLegacyId,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(row._id);
    if (updated) await rememberCategorization(ctx, updated);

    return {
      transactionId,
      section,
      category,
      subcategory,
      spread,
    };
  },
});

export const renameDescriptions = mutation({
  args: {
    from: v.string(),
    to: v.string(),
    taxonomy: v.optional(
      v.object({
        section: v.union(v.string(), v.null()),
        category: v.union(v.string(), v.null()),
        subcategory: v.union(v.string(), v.null()),
      }),
    ),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const from = args.from;
    const to = args.to.trim();
    if (!from) throw new Error("Current description is required");
    if (!to) throw new Error("Description is required");
    if (from === to && args.taxonomy === undefined) return { updated: 0 };

    const tax = args.taxonomy
      ? await resolveNamedTaxonomyPath(ctx, user._id, args.taxonomy)
      : null;

    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    let updated = 0;
    const now = Date.now();
    for (const row of rows) {
      if (row.description !== from) continue;
      await ctx.db.patch(row._id, {
        description: to,
        updatedAt: now,
        ...(tax
          ? {
              section: tax.section,
              sectionLegacyId: tax.sectionLegacyId,
              category: tax.category,
              categoryLegacyId: tax.categoryLegacyId,
              subcategory: tax.subcategory,
              subcategoryLegacyId: tax.subcategoryLegacyId,
              spread: tax.spread,
              spreadLegacyId: tax.spreadLegacyId,
            }
          : {}),
      });
      const updatedRow = await ctx.db.get(row._id);
      if (updatedRow) await rememberCategorization(ctx, updatedRow);
      updated += 1;
    }
    return { updated };
  },
});

function merchantKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function rowMatchesMerchantName(
  row: {
    merchantClean: string | null;
    merchantName: string | null;
  },
  merchant: string,
) {
  const key = merchantKey(merchant);
  if (!key) return false;
  return (
    merchantKey(row.merchantClean) === key ||
    merchantKey(row.merchantName) === key
  );
}

const taxonomyPatchValidator = v.object({
  section: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  subcategory: v.union(v.string(), v.null()),
});

/** Apply section / category / subcategory to every row for one payee. */
export const recategorizeByMerchant = mutation({
  args: {
    merchant: v.string(),
    merchantId: v.optional(v.id("merchants")),
    taxonomy: taxonomyPatchValidator,
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const merchant = args.merchant.trim();
    if (!merchant) throw new Error("Merchant is required");

    const tax = await resolveNamedTaxonomyPath(ctx, user._id, args.taxonomy);
    const patch = {
      section: tax.section,
      sectionLegacyId: tax.sectionLegacyId,
      category: tax.category,
      categoryLegacyId: tax.categoryLegacyId,
      subcategory: tax.subcategory,
      subcategoryLegacyId: tax.subcategoryLegacyId,
      spread: tax.spread,
      spreadLegacyId: tax.spreadLegacyId,
      updatedAt: Date.now(),
    };

    const merchantId = args.merchantId;
    let rows;
    if (merchantId) {
      const owned = await ctx.db.get(merchantId);
      if (!owned || owned.userId !== user._id) {
        throw new Error("Merchant not found");
      }
      rows = await ctx.db
        .query("transactions")
        .withIndex("by_userId_merchantId", (q) =>
          q.eq("userId", user._id).eq("merchantId", merchantId),
        )
        .collect();
    } else {
      const all = await ctx.db
        .query("transactions")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      rows = all.filter((row) => rowMatchesMerchantName(row, merchant));
    }

    let updated = 0;
    for (const row of rows) {
      await ctx.db.patch(row._id, patch);
      const updatedRow = await ctx.db.get(row._id);
      if (updatedRow) await rememberCategorization(ctx, updatedRow);
      updated += 1;
    }
    return { updated };
  },
});

const aiTxnRow = v.object({
  transactionId: v.string(),
  date: v.string(),
  description: v.string(),
  merchant: v.union(v.string(), v.null()),
  amount: v.number(),
  currency: v.string(),
  section: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  subcategory: v.union(v.string(), v.null()),
  tags: v.union(v.string(), v.null()),
});

function haystack(row: {
  description: string;
  merchantClean: string | null;
  merchantName: string | null;
  section: string | null;
  category: string | null;
  subcategory: string | null;
}) {
  return [
    row.description,
    row.merchantClean,
    row.merchantName,
    row.section,
    row.category,
    row.subcategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toAiTxn(row: {
  transactionId: string;
  posted: string;
  description: string;
  merchantClean: string | null;
  merchantName: string | null;
  amount: number;
  currency: string;
  section: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string | null;
}) {
  return {
    transactionId: row.transactionId,
    date: row.posted,
    description: row.description,
    merchant: row.merchantClean ?? row.merchantName,
    amount: row.amount,
    currency: row.currency,
    section: row.section,
    category: row.category,
    subcategory: row.subcategory,
    tags: row.tags,
  };
}

/** Bounded search over the signed-in user's ledger for Ledger AI. */
export const searchForAi = query({
  args: {
    query: v.optional(v.string()),
    merchant: v.optional(v.string()),
    section: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    matches: v.array(aiTxnRow),
    scanned: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 25)));
    const qText = args.query?.trim().toLowerCase() ?? "";
    const merchant = args.merchant?.trim().toLowerCase() ?? "";
    const section = args.section?.trim().toLowerCase() ?? "";
    const category = args.category?.trim().toLowerCase() ?? "";
    const subcategory = args.subcategory?.trim().toLowerCase() ?? "";
    const startDate = args.startDate?.trim() || null;
    const endDate = args.endDate?.trim() || null;

    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => {
        const base = q.eq("userId", user._id);
        if (startDate && endDate) {
          return base.gte("posted", startDate).lte("posted", endDate);
        }
        if (startDate) return base.gte("posted", startDate);
        if (endDate) return base.lte("posted", endDate);
        return base;
      })
      .order("desc")
      .take(500);

    const matches = [];
    for (const row of rows) {
      if (merchant) {
        const label = `${row.merchantClean ?? ""} ${row.merchantName ?? ""}`.toLowerCase();
        if (!label.includes(merchant)) continue;
      }
      if (section && norm(row.section) !== section) continue;
      if (category && norm(row.category) !== category) continue;
      if (subcategory && norm(row.subcategory) !== subcategory) continue;
      if (qText && !haystack(row).includes(qText)) continue;
      matches.push(toAiTxn(row));
      if (matches.length >= limit) break;
    }

    return {
      matches,
      scanned: rows.length,
      truncated: rows.length === 500,
    };
  },
});

/** Spend totals for the signed-in user, grouped for Ledger AI. */
export const summarizeForAi = query({
  args: {
    groupBy: v.union(
      v.literal("merchant"),
      v.literal("section"),
      v.literal("category"),
      v.literal("subcategory"),
    ),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  returns: v.object({
    groupBy: v.string(),
    scanned: v.number(),
    truncated: v.boolean(),
    spendTotal: v.number(),
    incomeTotal: v.number(),
    groups: v.array(
      v.object({
        name: v.string(),
        spend: v.number(),
        income: v.number(),
        count: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const startDate = args.startDate?.trim() || null;
    const endDate = args.endDate?.trim() || null;

    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => {
        const base = q.eq("userId", user._id);
        if (startDate && endDate) {
          return base.gte("posted", startDate).lte("posted", endDate);
        }
        if (startDate) return base.gte("posted", startDate);
        if (endDate) return base.lte("posted", endDate);
        return base;
      })
      .order("desc")
      .take(1500);

    const buckets = new Map<
      string,
      { spend: number; income: number; count: number }
    >();
    let spendTotal = 0;
    let incomeTotal = 0;

    for (const row of rows) {
      let name = "Unlabeled";
      if (args.groupBy === "merchant") {
        name = row.merchantClean || row.merchantName || "Unknown";
      } else if (args.groupBy === "section") {
        name = row.section || "Unlabeled";
      } else if (args.groupBy === "category") {
        name = row.category || "Unlabeled";
      } else {
        name = row.subcategory || "Unlabeled";
      }

      const bucket = buckets.get(name) ?? { spend: 0, income: 0, count: 0 };
      bucket.count += 1;
      if (row.amount > 0) {
        bucket.spend += row.amount;
        spendTotal += row.amount;
      } else if (row.amount < 0) {
        const income = Math.abs(row.amount);
        bucket.income += income;
        incomeTotal += income;
      }
      buckets.set(name, bucket);
    }

    const groups = [...buckets.entries()]
      .map(([name, bucket]) => ({
        name,
        spend: Number(bucket.spend.toFixed(2)),
        income: Number(bucket.income.toFixed(2)),
        count: bucket.count,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 20);

    return {
      groupBy: args.groupBy,
      scanned: rows.length,
      truncated: rows.length === 1500,
      spendTotal: Number(spendTotal.toFixed(2)),
      incomeTotal: Number(incomeTotal.toFixed(2)),
      groups,
    };
  },
});
