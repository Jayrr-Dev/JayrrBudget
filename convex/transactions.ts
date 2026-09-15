import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ensureUser, requireUser } from "./lib/auth";
import { classifySpread } from "./lib/spreads";
import { hasTag, joinTags, splitTags } from "./lib/tags";
import { taxonomyDescription } from "./lib/taxonomyDescriptions";
import { rememberCategorization } from "./lib/categorizationMemory";

const TAXONOMY_FIELDS = ["section", "spread", "category", "subcategory"] as const;

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error("Dates must be YYYY-MM-DD");
    }
    if (startDate > endDate) {
      throw new Error("Start date must be on or before end date");
    }

    const exclude = new Set(
      (args.excludeTransactionIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean),
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
      throw new Error("field must be section, spread, category, or subcategory");
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

    const ensureCategory = async (
      name: string,
      sectionId: number | null,
    ) => {
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
