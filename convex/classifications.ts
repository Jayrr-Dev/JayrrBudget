import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { taxonomyDescription } from "./lib/taxonomyDescriptions";

function norm(value: string) {
  return value.trim().toLowerCase();
}

const sectionDoc = v.object({
  id: v.id("transactionSections"),
  legacyId: v.number(),
  name: v.string(),
  description: v.string(),
});

const categoryDoc = v.object({
  id: v.id("transactionCategories"),
  legacyId: v.number(),
  name: v.string(),
  description: v.string(),
  sectionId: v.union(v.id("transactionSections"), v.null()),
  sectionLegacyId: v.union(v.number(), v.null()),
  sectionName: v.union(v.string(), v.null()),
});

const subcategoryDoc = v.object({
  id: v.id("transactionSubcategories"),
  legacyId: v.number(),
  name: v.string(),
  description: v.string(),
  categoryId: v.union(v.id("transactionCategories"), v.null()),
  categoryLegacyId: v.union(v.number(), v.null()),
  categoryName: v.union(v.string(), v.null()),
});

async function nextLegacyId(
  ctx: MutationCtx,
  table:
    | "transactionSections"
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

async function userTransactions(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("transactions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
}

async function ownedSection(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: Id<"transactionSections">,
) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== userId) {
    throw new Error("Section not found");
  }
  return row;
}

async function ownedCategory(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: Id<"transactionCategories">,
) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== userId) {
    throw new Error("Category not found");
  }
  return row;
}

async function ownedSubcategory(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: Id<"transactionSubcategories">,
) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== userId) {
    throw new Error("Subcategory not found");
  }
  return row;
}

async function assertUniqueName(
  rows: Array<{ _id: string; name: string }>,
  name: string,
  excludeId?: string,
) {
  const taken = rows.some(
    (row) => row._id !== excludeId && norm(row.name) === norm(name),
  );
  if (taken) {
    throw new Error(`"${name.trim()}" already exists`);
  }
}

function toSection(row: Doc<"transactionSections">) {
  return {
    id: row._id,
    legacyId: row.legacyId,
    name: row.name,
    description: row.description,
  };
}

export const list = query({
  args: {},
  returns: v.object({
    sections: v.array(sectionDoc),
    categories: v.array(categoryDoc),
    subcategories: v.array(subcategoryDoc),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [sections, categories, subcategories] = await Promise.all([
      ctx.db
        .query("transactionSections")
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

    const sectionByLegacy = new Map(sections.map((row) => [row.legacyId, row]));
    const categoryByLegacy = new Map(
      categories.map((row) => [row.legacyId, row]),
    );

    return {
      sections: sections
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toSection),
      categories: categories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => {
          const section =
            row.sectionLegacyId == null
              ? null
              : (sectionByLegacy.get(row.sectionLegacyId) ?? null);
          return {
            id: row._id,
            legacyId: row.legacyId,
            name: row.name,
            description: row.description,
            sectionId: section?._id ?? null,
            sectionLegacyId: row.sectionLegacyId,
            sectionName: section?.name ?? null,
          };
        }),
      subcategories: subcategories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => {
          const category =
            row.categoryLegacyId == null
              ? null
              : (categoryByLegacy.get(row.categoryLegacyId) ?? null);
          return {
            id: row._id,
            legacyId: row.legacyId,
            name: row.name,
            description: row.description,
            categoryId: category?._id ?? null,
            categoryLegacyId: row.categoryLegacyId,
            categoryName: category?.name ?? null,
          };
        }),
    };
  },
});

export const createSection = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: sectionDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Section name is required");
    const existing = await ctx.db
      .query("transactionSections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name);
    const description =
      args.description?.trim() || taxonomyDescription("section", name);
    const id = await ctx.db.insert("transactionSections", {
      userId: user._id,
      legacyId: await nextLegacyId(ctx, "transactionSections", user._id),
      name,
      description,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create section");
    return toSection(created);
  },
});

export const updateSection = mutation({
  args: {
    id: v.id("transactionSections"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: sectionDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedSection(ctx, user._id, args.id);
    const name = args.name.trim();
    if (!name) throw new Error("Section name is required");
    const existing = await ctx.db
      .query("transactionSections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name, row._id);
    const description =
      args.description !== undefined
        ? args.description.trim()
        : row.description;
    await ctx.db.patch(row._id, { name, description });
    if (name !== row.name) {
      const txs = await userTransactions(ctx, user._id);
      const now = Date.now();
      for (const tx of txs) {
        if (tx.sectionLegacyId !== row.legacyId) continue;
        await ctx.db.patch(tx._id, { section: name, updatedAt: now });
      }
    }
    const updated = await ctx.db.get(row._id);
    if (!updated) throw new Error("Section not found");
    return toSection(updated);
  },
});

export const deleteSection = mutation({
  args: { id: v.id("transactionSections") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedSection(ctx, user._id, args.id);
    const categories = await ctx.db
      .query("transactionCategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const childCount = categories.filter(
      (cat) => cat.sectionLegacyId === row.legacyId,
    ).length;
    if (childCount > 0) {
      throw new Error(
        `Move or delete ${childCount} categor${childCount === 1 ? "y" : "ies"} in this section first`,
      );
    }
    const txs = await userTransactions(ctx, user._id);
    const now = Date.now();
    for (const tx of txs) {
      if (tx.sectionLegacyId !== row.legacyId) continue;
      await ctx.db.patch(tx._id, {
        section: null,
        sectionLegacyId: null,
        updatedAt: now,
      });
    }
    await ctx.db.delete(row._id);
    return { ok: true as const };
  },
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    sectionId: v.id("transactionSections"),
  },
  returns: categoryDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Category name is required");
    const section = await ownedSection(ctx, user._id, args.sectionId);
    const existing = await ctx.db
      .query("transactionCategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name);
    const description =
      args.description?.trim() || taxonomyDescription("category", name);
    const id = await ctx.db.insert("transactionCategories", {
      userId: user._id,
      legacyId: await nextLegacyId(ctx, "transactionCategories", user._id),
      name,
      sectionLegacyId: section.legacyId,
      description,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create category");
    return {
      id: created._id,
      legacyId: created.legacyId,
      name: created.name,
      description: created.description,
      sectionId: section._id,
      sectionLegacyId: created.sectionLegacyId,
      sectionName: section.name,
    };
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("transactionCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    sectionId: v.id("transactionSections"),
  },
  returns: categoryDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedCategory(ctx, user._id, args.id);
    const name = args.name.trim();
    if (!name) throw new Error("Category name is required");
    const section = await ownedSection(ctx, user._id, args.sectionId);
    const existing = await ctx.db
      .query("transactionCategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name, row._id);
    const description =
      args.description !== undefined
        ? args.description.trim()
        : row.description;
    await ctx.db.patch(row._id, {
      name,
      description,
      sectionLegacyId: section.legacyId,
    });
    const renamed = name !== row.name;
    const moved = row.sectionLegacyId !== section.legacyId;
    if (renamed || moved) {
      const txs = await userTransactions(ctx, user._id);
      const now = Date.now();
      for (const tx of txs) {
        if (tx.categoryLegacyId !== row.legacyId) continue;
        await ctx.db.patch(tx._id, {
          category: name,
          section: section.name,
          sectionLegacyId: section.legacyId,
          updatedAt: now,
        });
      }
    }
    return {
      id: row._id,
      legacyId: row.legacyId,
      name,
      description,
      sectionId: section._id,
      sectionLegacyId: section.legacyId,
      sectionName: section.name,
    };
  },
});

export const deleteCategory = mutation({
  args: { id: v.id("transactionCategories") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedCategory(ctx, user._id, args.id);
    const subs = await ctx.db
      .query("transactionSubcategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const childCount = subs.filter(
      (sub) => sub.categoryLegacyId === row.legacyId,
    ).length;
    if (childCount > 0) {
      throw new Error(
        `Move or delete ${childCount} subcategor${childCount === 1 ? "y" : "ies"} in this category first`,
      );
    }
    const txs = await userTransactions(ctx, user._id);
    const now = Date.now();
    for (const tx of txs) {
      if (tx.categoryLegacyId !== row.legacyId) continue;
      await ctx.db.patch(tx._id, {
        category: null,
        categoryLegacyId: null,
        updatedAt: now,
      });
    }
    await ctx.db.delete(row._id);
    return { ok: true as const };
  },
});

export const createSubcategory = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.id("transactionCategories"),
  },
  returns: subcategoryDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Subcategory name is required");
    const category = await ownedCategory(ctx, user._id, args.categoryId);
    const existing = await ctx.db
      .query("transactionSubcategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name);
    const description =
      args.description?.trim() || taxonomyDescription("subcategory", name);
    const id = await ctx.db.insert("transactionSubcategories", {
      userId: user._id,
      legacyId: await nextLegacyId(ctx, "transactionSubcategories", user._id),
      name,
      categoryLegacyId: category.legacyId,
      description,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create subcategory");
    return {
      id: created._id,
      legacyId: created.legacyId,
      name: created.name,
      description: created.description,
      categoryId: category._id,
      categoryLegacyId: created.categoryLegacyId,
      categoryName: category.name,
    };
  },
});

export const updateSubcategory = mutation({
  args: {
    id: v.id("transactionSubcategories"),
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.id("transactionCategories"),
  },
  returns: subcategoryDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedSubcategory(ctx, user._id, args.id);
    const name = args.name.trim();
    if (!name) throw new Error("Subcategory name is required");
    const category = await ownedCategory(ctx, user._id, args.categoryId);
    const existing = await ctx.db
      .query("transactionSubcategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name, row._id);
    const description =
      args.description !== undefined
        ? args.description.trim()
        : row.description;
    await ctx.db.patch(row._id, {
      name,
      description,
      categoryLegacyId: category.legacyId,
    });
    const renamed = name !== row.name;
    const moved = row.categoryLegacyId !== category.legacyId;
    if (renamed || moved) {
      const section =
        category.sectionLegacyId == null
          ? null
          : await ctx.db
              .query("transactionSections")
              .withIndex("by_userId_legacyId", (q) =>
                q
                  .eq("userId", user._id)
                  .eq("legacyId", category.sectionLegacyId!),
              )
              .first();
      const txs = await userTransactions(ctx, user._id);
      const now = Date.now();
      for (const tx of txs) {
        if (tx.subcategoryLegacyId !== row.legacyId) continue;
        await ctx.db.patch(tx._id, {
          subcategory: name,
          category: category.name,
          categoryLegacyId: category.legacyId,
          section: section?.name ?? tx.section,
          sectionLegacyId: section?.legacyId ?? tx.sectionLegacyId,
          updatedAt: now,
        });
      }
    }
    return {
      id: row._id,
      legacyId: row.legacyId,
      name,
      description,
      categoryId: category._id,
      categoryLegacyId: category.legacyId,
      categoryName: category.name,
    };
  },
});

export const deleteSubcategory = mutation({
  args: { id: v.id("transactionSubcategories") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedSubcategory(ctx, user._id, args.id);
    const txs = await userTransactions(ctx, user._id);
    const now = Date.now();
    for (const tx of txs) {
      if (tx.subcategoryLegacyId !== row.legacyId) continue;
      await ctx.db.patch(tx._id, {
        subcategory: null,
        subcategoryLegacyId: null,
        updatedAt: now,
      });
    }
    await ctx.db.delete(row._id);
    return { ok: true as const };
  },
});
