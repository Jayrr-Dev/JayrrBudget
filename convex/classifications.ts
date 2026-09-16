import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireRole, requireUser, userRole } from "./lib/auth";
import { normalizedLabel, taxonomyKey } from "./lib/categorization";
import {
  CATEGORY_RENAMES,
  SEED_CATEGORY_PATHS,
  SUBCATEGORY_RENAMES,
  rewriteTaxonomyLabel,
} from "./lib/seedCategoryPaths";
import { ensureSeedSharedTags, sortSharedTagNames } from "./lib/seedSharedTags";
import {
  ensureMissingSeedPathsForUser,
  remountCategorySectionsForUser,
  remountFoodSectionForUser,
  seedStarterTaxonomyForUser,
} from "./lib/seedStarterTaxonomy";
import { joinTags, splitTags } from "./lib/tags";
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
  subcategoryNames: v.array(v.string()),
});

const ORPHAN_CATEGORY_TO_SECTION: Record<string, string> = {
  streaming: "Technology",
  recreational: "Lifestyle",
  "mobile & wireless": "Home",
  mobile: "Home",
};

const ORPHAN_SUB_TO_CATEGORY: Record<string, string> = {
  "fast food": "Restaurants",
  "dine-in": "Restaurants",
  "hotels & vacation rentals": "Lodging",
  "board game cafes": "Recreational",
  "theme parks": "Attractions",
  tours: "Attractions",
  recreation: "Recreational",
  pickleball: "Recreational",
  "driving range": "Recreational",
  golf: "Recreational",
  "cellphone plan": "Mobile",
  "car insurance": "Insurance",
  fuel: "Fuel",
  prescriptions: "Medical",
};

const subcategoryDoc = v.object({
  id: v.id("transactionSubcategories"),
  legacyId: v.number(),
  name: v.string(),
  description: v.string(),
  categoryId: v.union(v.id("transactionCategories"), v.null()),
  categoryLegacyId: v.union(v.number(), v.null()),
  categoryName: v.union(v.string(), v.null()),
  sectionName: v.union(v.string(), v.null()),
});

const tagDoc = v.object({
  id: v.id("transactionTags"),
  name: v.string(),
  description: v.string(),
});

const sharedTagDoc = v.object({
  name: v.string(),
  description: v.string(),
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

async function userTransactions(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
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

async function ownedTag(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: Id<"transactionTags">,
) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== userId) {
    throw new Error("Tag not found");
  }
  return row;
}

function toTag(row: Doc<"transactionTags">) {
  return {
    id: row._id,
    name: row.name,
    description: row.description,
  };
}

function tagFallback(name: string) {
  return `Tag: ${name}.`;
}

async function rewriteTransactionTags(
  ctx: MutationCtx,
  userId: Id<"users">,
  fromName: string,
  toName: string | null,
) {
  const from = normalizedLabel(fromName);
  const txs = await userTransactions(ctx, userId);
  const now = Date.now();
  for (const tx of txs) {
    const tags = splitTags(tx.tags);
    if (!tags.some((tag) => normalizedLabel(tag) === from)) continue;
    const next = tags
      .map((tag) => (normalizedLabel(tag) === from ? toName : tag))
      .filter((tag): tag is string => Boolean(tag));
    await ctx.db.patch(tx._id, { tags: joinTags(next), updatedAt: now });
  }
}

async function publishSharedTag(
  ctx: MutationCtx,
  name: string,
  description: string,
) {
  const key = normalizedLabel(name);
  const existing = await ctx.db
    .query("sharedTags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return false;
  await ctx.db.insert("sharedTags", {
    key,
    name,
    description: description.trim() || tagFallback(name),
  });
  return true;
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

function toCategory(
  row: Doc<"transactionCategories">,
  section: Doc<"transactionSections"> | null,
  subcategoryNames: string[],
) {
  return {
    id: row._id,
    legacyId: row.legacyId,
    name: row.name,
    description: row.description,
    sectionId: section?._id ?? null,
    sectionLegacyId: row.sectionLegacyId,
    sectionName: section?.name ?? null,
    subcategoryNames,
  };
}

function findByName<T extends { name: string }>(rows: T[], name: string) {
  const key = norm(name);
  return rows.find((row) => norm(row.name) === key) ?? null;
}

const categorySubDraft = v.object({
  id: v.optional(v.id("transactionSubcategories")),
  name: v.string(),
});

async function rewriteSubcategoryTransactions(
  ctx: MutationCtx,
  userId: Id<"users">,
  subcategoryLegacyId: number,
  name: string,
  category: Doc<"transactionCategories">,
) {
  const section =
    category.sectionLegacyId == null
      ? null
      : await ctx.db
          .query("transactionSections")
          .withIndex("by_userId_legacyId", (q) =>
            q.eq("userId", userId).eq("legacyId", category.sectionLegacyId!),
          )
          .first();
  const txs = await userTransactions(ctx, userId);
  const now = Date.now();
  for (const tx of txs) {
    if (tx.subcategoryLegacyId !== subcategoryLegacyId) continue;
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

async function syncCategorySubcategories(
  ctx: MutationCtx,
  userId: Id<"users">,
  category: Doc<"transactionCategories">,
  drafts: Array<{ id?: Id<"transactionSubcategories">; name: string }>,
  existingSubs: Array<Doc<"transactionSubcategories">>,
) {
  const wanted = drafts
    .map((draft) => ({
      id: draft.id,
      name: draft.name.trim(),
    }))
    .filter((draft) => draft.name);
  if (wanted.length === 0) {
    return await ensureDefaultSubcategory(ctx, userId, category, existingSubs);
  }

  const working = existingSubs.slice();
  const keep = new Set<Id<"transactionSubcategories">>();
  for (const draft of wanted) {
    if (draft.id) {
      const row = await ownedSubcategory(ctx, userId, draft.id);
      if (row.categoryLegacyId !== category.legacyId) {
        throw new Error("Subcategory does not belong to this category");
      }
      await assertUniqueName(working, draft.name, row._id);
      const description =
        draft.name === row.name
          ? row.description
          : taxonomyDescription("subcategory", draft.name);
      await ctx.db.patch(row._id, {
        name: draft.name,
        description,
        categoryLegacyId: category.legacyId,
      });
      if (draft.name !== row.name) {
        await rewriteSubcategoryTransactions(
          ctx,
          userId,
          row.legacyId,
          draft.name,
          category,
        );
      }
      keep.add(row._id);
      const idx = working.findIndex((sub) => sub._id === row._id);
      if (idx >= 0) {
        working[idx] = { ...row, name: draft.name, description };
      }
      continue;
    }

    const existingByName = working.find(
      (sub) => norm(sub.name) === norm(draft.name),
    );
    if (existingByName) {
      if (existingByName.categoryLegacyId === category.legacyId) {
        keep.add(existingByName._id);
      }
      continue;
    }
    const id = await ctx.db.insert("transactionSubcategories", {
      userId,
      legacyId: await nextLegacyId(ctx, "transactionSubcategories", userId),
      name: draft.name,
      categoryLegacyId: category.legacyId,
      description: taxonomyDescription("subcategory", draft.name),
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create subcategory");
    keep.add(created._id);
    working.push(created);
  }

  if (keep.size === 0) {
    return await ensureDefaultSubcategory(ctx, userId, category, working);
  }

  const children = working.filter(
    (sub) => sub.categoryLegacyId === category.legacyId,
  );
  for (const child of children) {
    if (keep.has(child._id)) continue;
    const txs = await userTransactions(ctx, userId);
    const now = Date.now();
    for (const tx of txs) {
      if (tx.subcategoryLegacyId !== child.legacyId) continue;
      await ctx.db.patch(tx._id, {
        subcategory: null,
        subcategoryLegacyId: null,
        updatedAt: now,
      });
    }
    await ctx.db.delete(child._id);
  }

  return working.filter(
    (sub) => sub.categoryLegacyId === category.legacyId && keep.has(sub._id),
  );
}

async function ensureDefaultSubcategory(
  ctx: MutationCtx,
  userId: Id<"users">,
  category: Pick<Doc<"transactionCategories">, "legacyId" | "name">,
  existingSubs: Array<Doc<"transactionSubcategories">>,
) {
  const hasChild = existingSubs.some(
    (sub) => sub.categoryLegacyId === category.legacyId,
  );
  if (hasChild) return existingSubs;
  const nameTaken = existingSubs.some(
    (sub) => norm(sub.name) === norm(category.name),
  );
  if (nameTaken) return existingSubs;
  const legacyId = await nextLegacyId(ctx, "transactionSubcategories", userId);
  const id = await ctx.db.insert("transactionSubcategories", {
    userId,
    legacyId,
    name: category.name,
    categoryLegacyId: category.legacyId,
    description: taxonomyDescription("subcategory", category.name),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create subcategory");
  return [...existingSubs, created];
}

export const seedSharedTags = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    return await ensureSeedSharedTags(ctx);
  },
});

export const ensureStarter = mutation({
  args: {},
  returns: v.object({
    seeded: v.boolean(),
    sections: v.number(),
    categories: v.number(),
    subcategories: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ensureSeedSharedTags(ctx);
    return await seedStarterTaxonomyForUser(ctx, user);
  },
});

/**
 * Make `sharedCategoryPaths` match SEED_CATEGORY_PATHS exactly, then drop the
 * retired paths from each user's private tree when no transaction uses them.
 */
export const reconcileSharedPaths = internalMutation({
  args: {},
  returns: v.object({
    sharedAdded: v.number(),
    sharedRemoved: v.number(),
    userCategoriesRemoved: v.number(),
    userSubcategoriesRemoved: v.number(),
    userSectionsAdded: v.number(),
    userCategoriesAdded: v.number(),
    userSubcategoriesAdded: v.number(),
  }),
  handler: async (ctx) => {
    await ensureSeedSharedTags(ctx);
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const categories = await ctx.db
        .query("transactionCategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      for (const category of categories) {
        const rename = CATEGORY_RENAMES.find(
          (row) => norm(row.from) === norm(category.name),
        );
        if (!rename) continue;
        await ctx.db.patch(category._id, {
          name: rename.to,
          description: taxonomyDescription("category", rename.to),
        });
        category.name = rename.to;
      }
      const subs = await ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      for (const sub of subs) {
        const rename = SUBCATEGORY_RENAMES.find(
          (row) => norm(row.from) === norm(sub.name),
        );
        if (!rename) continue;
        await ctx.db.patch(sub._id, {
          name: rename.to,
          description: taxonomyDescription("subcategory", rename.to),
        });
        sub.name = rename.to;
      }
      await remountFoodSectionForUser(ctx, user._id);
      await remountCategorySectionsForUser(ctx, user._id);
    }
    const canonicalKeys = new Set(
      SEED_CATEGORY_PATHS.map((p) =>
        taxonomyKey(p.section, p.category, p.subcategory),
      ),
    );
    const existing = await ctx.db.query("sharedCategoryPaths").collect();
    const existingKeys = new Set(existing.map((row) => row.key));

    const retired = existing.filter((row) => !canonicalKeys.has(row.key));
    for (const row of retired) await ctx.db.delete(row._id);

    let sharedAdded = 0;
    for (const p of SEED_CATEGORY_PATHS) {
      const key = taxonomyKey(p.section, p.category, p.subcategory);
      if (existingKeys.has(key)) continue;
      await ctx.db.insert("sharedCategoryPaths", {
        key,
        section: p.section,
        category: p.category,
        subcategory: p.subcategory,
      });
      sharedAdded += 1;
    }

    const retiredCategoryKeys = new Set(
      retired.filter((r) => r.subcategory == null).map((r) => r.key),
    );
    const retiredSubKeys = new Set(
      retired.filter((r) => r.subcategory != null).map((r) => r.key),
    );

    let userCategoriesRemoved = 0;
    let userSubcategoriesRemoved = 0;
    for (const user of users) {
      const [sections, categories, subs, txs] = await Promise.all([
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
        userTransactions(ctx, user._id),
      ]);
      const usedCategoryIds = new Set(txs.map((t) => t.categoryLegacyId));
      const usedSubIds = new Set(txs.map((t) => t.subcategoryLegacyId));
      const sectionName = (legacyId: number | null | undefined) =>
        sections.find((s) => s.legacyId === legacyId)?.name ?? "";

      for (const sub of subs) {
        const category = categories.find(
          (c) => c.legacyId === sub.categoryLegacyId,
        );
        if (!category) continue;
        const key = taxonomyKey(
          sectionName(category.sectionLegacyId),
          category.name,
          sub.name,
        );
        const echo =
          normalizedLabel(sub.name) === normalizedLabel(category.name);
        const extra = !canonicalKeys.has(key);
        if (
          (!retiredSubKeys.has(key) && !echo && !extra) ||
          usedSubIds.has(sub.legacyId)
        )
          continue;
        await ctx.db.delete(sub._id);
        userSubcategoriesRemoved += 1;
      }

      for (const category of categories) {
        const key = taxonomyKey(
          sectionName(category.sectionLegacyId),
          category.name,
          null,
        );
        const extra = !canonicalKeys.has(key);
        if (
          (!retiredCategoryKeys.has(key) && !extra) ||
          usedCategoryIds.has(category.legacyId)
        )
          continue;
        const children = subs.filter(
          (s) => s.categoryLegacyId === category.legacyId,
        );
        if (children.some((s) => usedSubIds.has(s.legacyId))) continue;
        for (const child of children) {
          const doc = await ctx.db.get(child._id);
          if (!doc) continue;
          await ctx.db.delete(child._id);
          userSubcategoriesRemoved += 1;
        }
        await ctx.db.delete(category._id);
        userCategoriesRemoved += 1;
      }
    }

    let userSectionsAdded = 0;
    let userCategoriesAdded = 0;
    let userSubcategoriesAdded = 0;
    for (const user of users) {
      const added = await ensureMissingSeedPathsForUser(ctx, user._id);
      userSectionsAdded += added.sections;
      userCategoriesAdded += added.categories;
      userSubcategoriesAdded += added.subcategories;
      const userSections = await ctx.db
        .query("transactionSections")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      for (const section of userSections) {
        const next = taxonomyDescription("section", section.name);
        if (section.description === next) continue;
        await ctx.db.patch(section._id, { description: next });
      }
    }

    await ctx.scheduler.runAfter(
      0,
      internal.classifications.rewriteTxnTaxonomyLabels,
      {
        cursor: null,
      },
    );

    return {
      sharedAdded,
      sharedRemoved: retired.length,
      userCategoriesRemoved,
      userSubcategoriesRemoved,
      userSectionsAdded,
      userCategoriesAdded,
      userSubcategoriesAdded,
    };
  },
});

/** Copy catalog names onto denormalized transaction.category / subcategory. */
export const rewriteTxnTaxonomyLabels = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    patched: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("transactions").paginate({
      numItems: 40,
      cursor: args.cursor,
    });
    const categoryRename = new Map(
      CATEGORY_RENAMES.map((row) => [norm(row.from), row.to]),
    );
    const subRename = new Map(
      SUBCATEGORY_RENAMES.map((row) => [norm(row.from), row.to]),
    );
    let patched = 0;
    for (const tx of page.page) {
      let nextCategory = tx.category;
      let nextSub = tx.subcategory;
      if (tx.categoryLegacyId != null) {
        const category = await ctx.db
          .query("transactionCategories")
          .withIndex("by_userId_legacyId", (q) =>
            q.eq("userId", tx.userId).eq("legacyId", tx.categoryLegacyId!),
          )
          .unique();
        if (category) nextCategory = category.name;
      } else if (tx.category) {
        nextCategory = categoryRename.get(norm(tx.category)) ?? tx.category;
      }
      nextCategory = rewriteTaxonomyLabel("category", nextCategory);
      if (tx.subcategoryLegacyId != null) {
        const sub = await ctx.db
          .query("transactionSubcategories")
          .withIndex("by_userId_legacyId", (q) =>
            q.eq("userId", tx.userId).eq("legacyId", tx.subcategoryLegacyId!),
          )
          .unique();
        if (sub) nextSub = sub.name;
      } else if (tx.subcategory) {
        nextSub = subRename.get(norm(tx.subcategory)) ?? tx.subcategory;
      }
      nextSub = rewriteTaxonomyLabel("subcategory", nextSub);
      const patch: { category?: string | null; subcategory?: string | null } =
        {};
      if (nextCategory !== tx.category) patch.category = nextCategory;
      if (nextSub !== tx.subcategory) patch.subcategory = nextSub;
      if (Object.keys(patch).length === 0) continue;
      await ctx.db.patch(tx._id, patch);
      patched += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.classifications.rewriteTxnTaxonomyLabels,
        { cursor: page.continueCursor },
      );
    }
    return {
      patched,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

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

    const sectionName = (sectionLegacyId: number | null) =>
      sectionLegacyId == null
        ? ""
        : (sectionByLegacy.get(sectionLegacyId)?.name ?? "");

    const categoryName = (categoryLegacyId: number | null) =>
      categoryLegacyId == null
        ? ""
        : (categoryByLegacy.get(categoryLegacyId)?.name ?? "");

    return {
      sections: sections
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toSection),
      categories: categories
        .slice()
        .sort((a, b) => {
          const sectionCmp = sectionName(a.sectionLegacyId).localeCompare(
            sectionName(b.sectionLegacyId),
          );
          if (sectionCmp !== 0) return sectionCmp;
          return a.name.localeCompare(b.name);
        })
        .map((row) => {
          const section =
            row.sectionLegacyId == null
              ? null
              : (sectionByLegacy.get(row.sectionLegacyId) ?? null);
          const subcategoryNames = subcategories
            .filter((sub) => sub.categoryLegacyId === row.legacyId)
            .map((sub) => sub.name)
            .sort((a, b) => a.localeCompare(b));
          return toCategory(row, section, subcategoryNames);
        }),
      subcategories: subcategories
        .slice()
        .sort((a, b) => {
          const categoryCmp = categoryName(a.categoryLegacyId).localeCompare(
            categoryName(b.categoryLegacyId),
          );
          if (categoryCmp !== 0) return categoryCmp;
          return a.name.localeCompare(b.name);
        })
        .map((row) => {
          const category =
            row.categoryLegacyId == null
              ? null
              : (categoryByLegacy.get(row.categoryLegacyId) ?? null);
          const section =
            category?.sectionLegacyId == null
              ? null
              : (sectionByLegacy.get(category.sectionLegacyId) ?? null);
          return {
            id: row._id,
            legacyId: row.legacyId,
            name: row.name,
            description: row.description,
            categoryId: category?._id ?? null,
            categoryLegacyId: row.categoryLegacyId,
            categoryName: category?.name ?? null,
            sectionName: section?.name ?? null,
          };
        }),
    };
  },
});

const sharedSectionDoc = v.object({
  name: v.string(),
  description: v.string(),
});

const sharedCategoryDoc = v.object({
  name: v.string(),
  description: v.string(),
  sectionName: v.string(),
  subcategoryNames: v.array(v.string()),
});

const sharedSubcategoryDoc = v.object({
  name: v.string(),
  description: v.string(),
  sectionName: v.string(),
  categoryName: v.string(),
});

function catalogKey(parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizedLabel(part ?? "")).join("::");
}

async function loadSharedPaths(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query("sharedCategoryPaths").collect();
}

async function publishSharedPath(
  ctx: MutationCtx,
  section: string,
  category: string,
  subcategory: string | null,
) {
  const key = taxonomyKey(section, category, subcategory);
  const existing = await ctx.db
    .query("sharedCategoryPaths")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return false;
  await ctx.db.insert("sharedCategoryPaths", {
    key,
    section,
    category,
    subcategory,
  });
  return true;
}

export const catalog = query({
  args: {},
  returns: v.object({
    isAdmin: v.boolean(),
    shared: v.object({
      sections: v.array(sharedSectionDoc),
      categories: v.array(sharedCategoryDoc),
      subcategories: v.array(sharedSubcategoryDoc),
      tags: v.array(sharedTagDoc),
    }),
    userOnly: v.object({
      sections: v.array(sectionDoc),
      categories: v.array(categoryDoc),
      subcategories: v.array(subcategoryDoc),
      tags: v.array(tagDoc),
    }),
    mine: v.object({
      sections: v.array(sectionDoc),
      categories: v.array(categoryDoc),
      subcategories: v.array(subcategoryDoc),
      tags: v.array(tagDoc),
    }),
    parents: v.object({
      sections: v.array(sectionDoc),
      categories: v.array(categoryDoc),
    }),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [paths, sharedTagRows, sections, categories, subcategories, tags] =
      await Promise.all([
        loadSharedPaths(ctx),
        ctx.db.query("sharedTags").collect(),
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
        ctx.db
          .query("transactionTags")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect(),
      ]);

    const sharedSectionNames = new Set(
      paths.map((path) => normalizedLabel(path.section)),
    );
    const sharedCategoryKeys = new Set(
      paths.map((path) => catalogKey([path.section, path.category])),
    );
    const sharedSubKeys = new Set(
      paths
        .filter((path) => path.subcategory)
        .map((path) =>
          catalogKey([path.section, path.category, path.subcategory]),
        ),
    );

    const sectionByName = new Map<
      string,
      { name: string; subs: Set<string> }
    >();
    for (const path of paths) {
      const sectionKey = norm(path.section);
      if (!sectionByName.has(sectionKey)) {
        sectionByName.set(sectionKey, { name: path.section, subs: new Set() });
      }
    }
    const categoryByKey = new Map<
      string,
      { name: string; sectionName: string; subs: string[] }
    >();
    for (const path of paths) {
      const key = catalogKey([path.section, path.category]);
      const found = categoryByKey.get(key);
      if (!found) {
        categoryByKey.set(key, {
          name: path.category,
          sectionName: path.section,
          subs: [],
        });
      }
      if (path.subcategory) {
        const bucket = categoryByKey.get(key);
        if (bucket && !bucket.subs.includes(path.subcategory)) {
          bucket.subs.push(path.subcategory);
        }
      }
    }

    const sharedSections = [...sectionByName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({
        name: row.name,
        description: taxonomyDescription("section", row.name),
      }));
    const sharedCategories = [...categoryByKey.values()]
      .sort((a, b) => {
        const sectionCmp = a.sectionName.localeCompare(b.sectionName);
        if (sectionCmp !== 0) return sectionCmp;
        return a.name.localeCompare(b.name);
      })
      .map((row) => ({
        name: row.name,
        sectionName: row.sectionName,
        subcategoryNames: row.subs.slice().sort((a, b) => a.localeCompare(b)),
        description: taxonomyDescription("category", row.name),
      }));
    const sharedSubs = paths
      .filter((path) => path.subcategory)
      .map((path) => ({
        name: path.subcategory as string,
        sectionName: path.section,
        categoryName: path.category,
        description: taxonomyDescription("subcategory", path.subcategory ?? ""),
      }))
      .sort((a, b) => {
        const categoryCmp = a.categoryName.localeCompare(b.categoryName);
        if (categoryCmp !== 0) return categoryCmp;
        return a.name.localeCompare(b.name);
      });

    const sectionByLegacy = new Map(sections.map((row) => [row.legacyId, row]));
    const categoryByLegacy = new Map(
      categories.map((row) => [row.legacyId, row]),
    );

    const parentCategories = categories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => {
        const section =
          row.sectionLegacyId == null
            ? null
            : (sectionByLegacy.get(row.sectionLegacyId) ?? null);
        const subcategoryNames = subcategories
          .filter((sub) => sub.categoryLegacyId === row.legacyId)
          .map((sub) => sub.name);
        return toCategory(row, section, subcategoryNames);
      });

    const userOnlySections = sections
      .filter((row) => !sharedSectionNames.has(normalizedLabel(row.name)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toSection);

    const userOnlyCategories = parentCategories.filter((row) => {
      if (!row.sectionName) return true;
      return !sharedCategoryKeys.has(catalogKey([row.sectionName, row.name]));
    });

    const toSub = (row: Doc<"transactionSubcategories">) => {
      const category =
        row.categoryLegacyId == null
          ? null
          : (categoryByLegacy.get(row.categoryLegacyId) ?? null);
      const section =
        category?.sectionLegacyId == null
          ? null
          : (sectionByLegacy.get(category.sectionLegacyId) ?? null);
      return {
        id: row._id,
        legacyId: row.legacyId,
        name: row.name,
        description: row.description,
        categoryId: category?._id ?? null,
        categoryLegacyId: row.categoryLegacyId,
        categoryName: category?.name ?? null,
        sectionName: section?.name ?? null,
      };
    };
    const allSubs = subcategories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toSub);
    const userOnlySubs = subcategories
      .filter((row) => {
        const category =
          row.categoryLegacyId == null
            ? null
            : (categoryByLegacy.get(row.categoryLegacyId) ?? null);
        const section =
          category?.sectionLegacyId == null
            ? null
            : (sectionByLegacy.get(category.sectionLegacyId) ?? null);
        if (!category || !section) return true;
        return !sharedSubKeys.has(
          catalogKey([section.name, category.name, row.name]),
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toSub);

    const sharedTagKeys = new Set(
      sharedTagRows.map((row) => normalizedLabel(row.name)),
    );
    const sharedTags = sharedTagRows
      .slice()
      .sort((a, b) => sortSharedTagNames(a.name, b.name))
      .map((row) => ({
        name: row.name,
        description: row.description,
      }));
    const userOnlyTags = tags
      .filter((row) => !sharedTagKeys.has(normalizedLabel(row.name)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toTag);

    const isAdmin = userRole(user) === "admin";
    const mine = {
      sections: sections
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toSection),
      categories: parentCategories,
      subcategories: allSubs,
      tags: tags
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toTag),
    };

    return {
      isAdmin,
      shared: {
        sections: sharedSections,
        categories: sharedCategories,
        subcategories: sharedSubs,
        tags: sharedTags,
      },
      userOnly: {
        sections: userOnlySections,
        categories: userOnlyCategories,
        subcategories: userOnlySubs,
        tags: userOnlyTags,
      },
      mine,
      parents: {
        sections: sections
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(toSection),
        categories: parentCategories,
      },
    };
  },
});

export const promoteToShared = mutation({
  args: {
    kind: v.union(
      v.literal("section"),
      v.literal("category"),
      v.literal("subcategory"),
      v.literal("tag"),
    ),
    sectionId: v.optional(v.id("transactionSections")),
    categoryId: v.optional(v.id("transactionCategories")),
    subcategoryId: v.optional(v.id("transactionSubcategories")),
    tagId: v.optional(v.id("transactionTags")),
  },
  returns: v.object({ added: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
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

    let added = 0;
    if (args.kind === "section") {
      if (!args.sectionId) throw new Error("Section is required");
      const section = await ownedSection(ctx, user._id, args.sectionId);
      const kids = categories.filter(
        (row) => row.sectionLegacyId === section.legacyId,
      );
      if (kids.length === 0) {
        throw new Error("Add a category under this section first");
      }
      for (const category of kids) {
        if (await publishSharedPath(ctx, section.name, category.name, null)) {
          added += 1;
        }
        for (const sub of subcategories.filter(
          (row) => row.categoryLegacyId === category.legacyId,
        )) {
          if (
            await publishSharedPath(ctx, section.name, category.name, sub.name)
          ) {
            added += 1;
          }
        }
      }
    } else if (args.kind === "category") {
      if (!args.categoryId) throw new Error("Category is required");
      const category = await ownedCategory(ctx, user._id, args.categoryId);
      const section =
        category.sectionLegacyId == null
          ? null
          : sections.find((row) => row.legacyId === category.sectionLegacyId);
      if (!section) throw new Error("Category needs a section first");
      if (await publishSharedPath(ctx, section.name, category.name, null)) {
        added += 1;
      }
      for (const sub of subcategories.filter(
        (row) => row.categoryLegacyId === category.legacyId,
      )) {
        if (
          await publishSharedPath(ctx, section.name, category.name, sub.name)
        ) {
          added += 1;
        }
      }
    } else if (args.kind === "subcategory") {
      if (!args.subcategoryId) throw new Error("Subcategory is required");
      const sub = await ownedSubcategory(ctx, user._id, args.subcategoryId);
      const category =
        sub.categoryLegacyId == null
          ? null
          : categories.find((row) => row.legacyId === sub.categoryLegacyId);
      const section =
        category?.sectionLegacyId == null
          ? null
          : sections.find((row) => row.legacyId === category.sectionLegacyId);
      if (!category || !section) {
        throw new Error("Subcategory needs a category and section first");
      }
      if (await publishSharedPath(ctx, section.name, category.name, null)) {
        added += 1;
      }
      if (await publishSharedPath(ctx, section.name, category.name, sub.name)) {
        added += 1;
      }
    } else {
      if (!args.tagId) throw new Error("Tag is required");
      const tag = await ownedTag(ctx, user._id, args.tagId);
      if (await publishSharedTag(ctx, tag.name, tag.description)) {
        added += 1;
      }
    }
    return { added };
  },
});

export const removeFromShared = mutation({
  args: {
    kind: v.union(
      v.literal("section"),
      v.literal("category"),
      v.literal("subcategory"),
      v.literal("tag"),
    ),
    section: v.string(),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
  },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    if (args.kind === "tag") {
      const needle = normalizedLabel(args.section);
      if (!needle) throw new Error("Tag is required");
      const rows = await ctx.db.query("sharedTags").collect();
      const matches = rows.filter(
        (row) => normalizedLabel(row.name) === needle,
      );
      for (const row of matches) {
        await ctx.db.delete(row._id);
      }
      return { removed: matches.length };
    }
    const section = args.section.trim();
    const category = args.category?.trim() ?? "";
    const subcategory = args.subcategory?.trim() ?? "";
    if (!section) throw new Error("Section is required");
    const paths = await loadSharedPaths(ctx);
    const matches = paths.filter((path) => {
      if (normalizedLabel(path.section) !== normalizedLabel(section))
        return false;
      if (args.kind === "section") return true;
      if (normalizedLabel(path.category) !== normalizedLabel(category))
        return false;
      if (args.kind === "category") return true;
      return (
        normalizedLabel(path.subcategory ?? "") === normalizedLabel(subcategory)
      );
    });
    for (const path of matches) {
      await ctx.db.delete(path._id);
    }
    return { removed: matches.length };
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
    subs: v.optional(v.array(categorySubDraft)),
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
    const existingSubs = await ctx.db
      .query("transactionSubcategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const synced = args.subs
      ? await syncCategorySubcategories(
          ctx,
          user._id,
          created,
          args.subs,
          existingSubs,
        )
      : await ensureDefaultSubcategory(ctx, user._id, created, existingSubs);
    return toCategory(
      created,
      section,
      synced
        .filter((sub) => sub.categoryLegacyId === created.legacyId)
        .map((sub) => sub.name),
    );
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("transactionCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    sectionId: v.id("transactionSections"),
    subs: v.optional(v.array(categorySubDraft)),
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
    const existingSubs = await ctx.db
      .query("transactionSubcategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const nextCategory = {
      ...row,
      name,
      description,
      sectionLegacyId: section.legacyId,
    };
    const synced = args.subs
      ? await syncCategorySubcategories(
          ctx,
          user._id,
          nextCategory,
          args.subs,
          existingSubs,
        )
      : await ensureDefaultSubcategory(
          ctx,
          user._id,
          { legacyId: row.legacyId, name },
          existingSubs,
        );
    return toCategory(
      nextCategory,
      section,
      synced
        .filter((sub) => sub.categoryLegacyId === row.legacyId)
        .map((sub) => sub.name),
    );
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
            .unique();
    return {
      id: created._id,
      legacyId: created.legacyId,
      name: created.name,
      description: created.description,
      categoryId: category._id,
      categoryLegacyId: created.categoryLegacyId,
      categoryName: category.name,
      sectionName: section?.name ?? null,
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
    const parentSection =
      category.sectionLegacyId == null
        ? null
        : await ctx.db
            .query("transactionSections")
            .withIndex("by_userId_legacyId", (q) =>
              q
                .eq("userId", user._id)
                .eq("legacyId", category.sectionLegacyId!),
            )
            .unique();
    return {
      id: row._id,
      legacyId: row.legacyId,
      name,
      description,
      categoryId: category._id,
      categoryLegacyId: category.legacyId,
      categoryName: category.name,
      sectionName: parentSection?.name ?? null,
    };
  },
});

export const deleteSubcategory = mutation({
  args: { id: v.id("transactionSubcategories") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedSubcategory(ctx, user._id, args.id);
    if (row.categoryLegacyId != null) {
      const siblings = await ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const remaining = siblings.filter(
        (sub) =>
          sub._id !== row._id && sub.categoryLegacyId === row.categoryLegacyId,
      );
      if (remaining.length === 0) {
        throw new Error(
          "A category needs at least one subcategory. Add another, then delete this one.",
        );
      }
    }
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

/** Attach orphan rows and give every category at least one subcategory. */
export const repairHierarchy = mutation({
  args: {},
  returns: v.object({
    linkedCategories: v.number(),
    linkedSubcategories: v.number(),
    createdSubcategories: v.number(),
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

    let linkedCategories = 0;
    for (const category of categories) {
      if (category.sectionLegacyId != null) continue;
      const sectionName =
        ORPHAN_CATEGORY_TO_SECTION[norm(category.name)] ?? null;
      const section = sectionName ? findByName(sections, sectionName) : null;
      if (!section) continue;
      await ctx.db.patch(category._id, { sectionLegacyId: section.legacyId });
      category.sectionLegacyId = section.legacyId;
      linkedCategories += 1;
    }

    let linkedSubcategories = 0;
    for (const sub of subcategories) {
      if (sub.categoryLegacyId != null) continue;
      const hinted = ORPHAN_SUB_TO_CATEGORY[norm(sub.name)];
      const category =
        (hinted ? findByName(categories, hinted) : null) ??
        findByName(categories, sub.name);
      if (!category) continue;
      await ctx.db.patch(sub._id, { categoryLegacyId: category.legacyId });
      sub.categoryLegacyId = category.legacyId;
      linkedSubcategories += 1;
    }

    let createdSubcategories = 0;
    let workingSubs = subcategories;
    for (const category of categories) {
      const before = workingSubs.length;
      workingSubs = await ensureDefaultSubcategory(
        ctx,
        user._id,
        category,
        workingSubs,
      );
      if (workingSubs.length > before) createdSubcategories += 1;
    }

    return { linkedCategories, linkedSubcategories, createdSubcategories };
  },
});

export const ensureUserTags = mutation({
  args: {},
  returns: v.object({ added: v.number() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [existing, txs] = await Promise.all([
      ctx.db
        .query("transactionTags")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      userTransactions(ctx, user._id),
    ]);
    const have = new Set(existing.map((row) => normalizedLabel(row.name)));
    let added = 0;
    for (const tx of txs) {
      for (const tag of splitTags(tx.tags)) {
        const key = normalizedLabel(tag);
        if (!key || have.has(key)) continue;
        have.add(key);
        await ctx.db.insert("transactionTags", {
          userId: user._id,
          name: tag,
          description: tagFallback(tag),
        });
        added += 1;
      }
    }
    return { added };
  },
});

export const createTag = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: tagDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Tag name is required");
    const existing = await ctx.db
      .query("transactionTags")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name);
    const id = await ctx.db.insert("transactionTags", {
      userId: user._id,
      name,
      description: args.description?.trim() || tagFallback(name),
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create tag");
    return toTag(created);
  },
});

export const updateTag = mutation({
  args: {
    id: v.id("transactionTags"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: tagDoc,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedTag(ctx, user._id, args.id);
    const name = args.name.trim();
    if (!name) throw new Error("Tag name is required");
    const existing = await ctx.db
      .query("transactionTags")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    await assertUniqueName(existing, name, row._id);
    const description =
      args.description !== undefined
        ? args.description.trim() || tagFallback(name)
        : row.description;
    await ctx.db.patch(row._id, { name, description });
    if (normalizedLabel(name) !== normalizedLabel(row.name)) {
      await rewriteTransactionTags(ctx, user._id, row.name, name);
    }
    const updated = await ctx.db.get(row._id);
    if (!updated) throw new Error("Tag not found");
    return toTag(updated);
  },
});

export const deleteTag = mutation({
  args: { id: v.id("transactionTags") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ownedTag(ctx, user._id, args.id);
    await rewriteTransactionTags(ctx, user._id, row.name, null);
    await ctx.db.delete(row._id);
    return { ok: true as const };
  },
});
