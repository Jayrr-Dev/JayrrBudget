import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { taxonomyDescription } from "./taxonomyDescriptions";
import {
  CATEGORY_SECTION_MOVES,
  FOOD_SECTION_CATEGORY_MOVES,
  FOOD_SUB_REMOUNTS,
  SEED_CATEGORY_PATHS,
  SUBCATEGORY_REMOUNTS,
} from "./seedCategoryPaths";

type SeedDb = Pick<MutationCtx, "db">;

type SeedPath = {
  section: string;
  category: string;
  subcategory: string | null;
};

function norm(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Copy the shared vocabulary (main catalog) into a new user's private tree.
 * Skips if they already have sections.
 */
export async function seedStarterTaxonomyForUser(
  ctx: SeedDb,
  user: Doc<"users">,
): Promise<{
  seeded: boolean;
  sections: number;
  categories: number;
  subcategories: number;
}> {
  const existing = await ctx.db
    .query("transactionSections")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .first();
  if (existing) {
    return { seeded: false, sections: 0, categories: 0, subcategories: 0 };
  }

  const shared = await ctx.db.query("sharedCategoryPaths").collect();
  const paths: SeedPath[] =
    shared.length > 0
      ? shared.map((row) => ({
          section: row.section,
          category: row.category,
          subcategory: row.subcategory,
        }))
      : SEED_CATEGORY_PATHS;

  const sectionLegacy = new Map<string, number>();
  const categoryByKey = new Map<
    string,
    { id: Id<"transactionCategories">; legacyId: number }
  >();
  let nextSection = 1;
  let nextCategory = 1;
  let nextSub = 1;
  let sectionCount = 0;
  let categoryCount = 0;
  let subCount = 0;

  for (const path of paths) {
    const sectionName = path.section.trim();
    const categoryName = path.category.trim();
    if (!sectionName || !categoryName) continue;

    const sectionKey = norm(sectionName);
    let sectionLegacyId = sectionLegacy.get(sectionKey);
    if (sectionLegacyId == null) {
      sectionLegacyId = nextSection;
      nextSection += 1;
      await ctx.db.insert("transactionSections", {
        userId: user._id,
        legacyId: sectionLegacyId,
        name: sectionName,
        description: taxonomyDescription("section", sectionName),
      });
      sectionLegacy.set(sectionKey, sectionLegacyId);
      sectionCount += 1;
    }

    const categoryKey = `${sectionKey}::${norm(categoryName)}`;
    let category = categoryByKey.get(categoryKey);
    if (!category) {
      const legacyId = nextCategory;
      nextCategory += 1;
      const id = await ctx.db.insert("transactionCategories", {
        userId: user._id,
        legacyId,
        name: categoryName,
        sectionLegacyId: sectionLegacyId,
        description: taxonomyDescription("category", categoryName),
      });
      category = { id, legacyId };
      categoryByKey.set(categoryKey, category);
      categoryCount += 1;
    }

    const subName = path.subcategory?.trim() || "";
    if (!subName) continue;
    await ctx.db.insert("transactionSubcategories", {
      userId: user._id,
      legacyId: nextSub,
      name: subName,
      categoryLegacyId: category.legacyId,
      description: taxonomyDescription("subcategory", subName),
    });
    nextSub += 1;
    subCount += 1;
  }

  return {
    seeded: true,
    sections: sectionCount,
    categories: categoryCount,
    subcategories: subCount,
  };
}

/** Add any missing seed paths to an existing user's private tree. */
export async function ensureMissingSeedPathsForUser(
  ctx: SeedDb,
  userId: Id<"users">,
): Promise<{ sections: number; categories: number; subcategories: number }> {
  const sections = await ctx.db
    .query("transactionSections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const categories = await ctx.db
    .query("transactionCategories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const subs = await ctx.db
    .query("transactionSubcategories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const sectionByName = new Map(sections.map((row) => [norm(row.name), row]));
  let nextSection = sections.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
  let nextCategory = categories.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
  let nextSub = subs.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
  let sectionCount = 0;
  let categoryCount = 0;
  let subCount = 0;

  for (const path of SEED_CATEGORY_PATHS) {
    let section = sectionByName.get(norm(path.section));
    if (!section) {
      const id = await ctx.db.insert("transactionSections", {
        userId,
        legacyId: nextSection,
        name: path.section,
        description: taxonomyDescription("section", path.section),
      });
      const created = await ctx.db.get(id);
      if (!created) continue;
      section = created;
      nextSection += 1;
      sectionByName.set(norm(path.section), section);
      sectionCount += 1;
    }

    let category = categories.find(
      (row) =>
        norm(row.name) === norm(path.category) &&
        row.sectionLegacyId === section.legacyId,
    );
    if (!category) {
      const id = await ctx.db.insert("transactionCategories", {
        userId,
        legacyId: nextCategory,
        name: path.category,
        sectionLegacyId: section.legacyId,
        description: taxonomyDescription("category", path.category),
      });
      const created = await ctx.db.get(id);
      if (!created) continue;
      category = created;
      nextCategory += 1;
      categories.push(category);
      categoryCount += 1;
    }

    const subName = path.subcategory?.trim() ?? "";
    if (!subName) continue;
    const exists = subs.some(
      (row) =>
        row.categoryLegacyId === category.legacyId &&
        norm(row.name) === norm(subName),
    );
    if (exists) continue;
    await ctx.db.insert("transactionSubcategories", {
      userId,
      legacyId: nextSub,
      name: subName,
      categoryLegacyId: category.legacyId,
      description: taxonomyDescription("subcategory", subName),
    });
    nextSub += 1;
    subCount += 1;
  }

  return { sections: sectionCount, categories: categoryCount, subcategories: subCount };
}

async function nextLegacy(
  rows: Array<{ legacyId: number }>,
) {
  return rows.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
}

async function ensureSection(
  ctx: SeedDb,
  userId: Id<"users">,
  sections: Doc<"transactionSections">[],
  name: string,
) {
  const existing = sections.find((row) => norm(row.name) === norm(name));
  if (existing) return existing;
  const id = await ctx.db.insert("transactionSections", {
    userId,
    legacyId: await nextLegacy(sections),
    name,
    description: taxonomyDescription("section", name),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create section");
  sections.push(created);
  return created;
}

async function ensureCategoryUnder(
  ctx: SeedDb,
  userId: Id<"users">,
  categories: Doc<"transactionCategories">[],
  section: Doc<"transactionSections">,
  name: string,
) {
  const existing = categories.find(
    (row) =>
      norm(row.name) === norm(name) && row.sectionLegacyId === section.legacyId,
  );
  if (existing) return existing;
  const id = await ctx.db.insert("transactionCategories", {
    userId,
    legacyId: await nextLegacy(categories),
    name,
    sectionLegacyId: section.legacyId,
    description: taxonomyDescription("category", name),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create category");
  categories.push(created);
  return created;
}

async function ensureSubUnder(
  ctx: SeedDb,
  userId: Id<"users">,
  subs: Doc<"transactionSubcategories">[],
  category: Doc<"transactionCategories">,
  name: string,
) {
  const existing = subs.find(
    (row) =>
      row.categoryLegacyId === category.legacyId && norm(row.name) === norm(name),
  );
  if (existing) return existing;
  const id = await ctx.db.insert("transactionSubcategories", {
    userId,
    legacyId: await nextLegacy(subs),
    name,
    categoryLegacyId: category.legacyId,
    description: taxonomyDescription("subcategory", name),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create subcategory");
  subs.push(created);
  return created;
}

/**
 * Lift Lifestyle food/drink rows onto the Food section and split the old
 * Food pile into Groceries / Restaurants / Takeout / Delivery.
 */
export async function remountFoodSectionForUser(
  ctx: SeedDb,
  userId: Id<"users">,
) {
  const sections = await ctx.db
    .query("transactionSections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const categories = await ctx.db
    .query("transactionCategories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const subs = await ctx.db
    .query("transactionSubcategories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const txs = await ctx.db
    .query("transactions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const foodSection = await ensureSection(ctx, userId, sections, "Food");
  const lifestyle = sections.find((row) => norm(row.name) === "lifestyle");

  for (const name of FOOD_SECTION_CATEGORY_MOVES) {
    const row = categories.find(
      (category) =>
        norm(category.name) === norm(name) &&
        (lifestyle == null || category.sectionLegacyId === lifestyle.legacyId),
    );
    if (!row || row.sectionLegacyId === foodSection.legacyId) continue;
    await ctx.db.patch(row._id, {
      sectionLegacyId: foodSection.legacyId,
      description: taxonomyDescription("category", row.name),
    });
    row.sectionLegacyId = foodSection.legacyId;
    for (const tx of txs) {
      if (tx.categoryLegacyId !== row.legacyId) continue;
      if (tx.sectionLegacyId === foodSection.legacyId) continue;
      await ctx.db.patch(tx._id, { sectionLegacyId: foodSection.legacyId });
      tx.sectionLegacyId = foodSection.legacyId;
    }
  }

  const splitParents = categories.filter((row) => {
    const name = norm(row.name);
    return name === "food" || name === "restaurants & cafes";
  });

  for (const parent of splitParents) {
    const parentSubs = subs.filter((row) => row.categoryLegacyId === parent.legacyId);
    for (const sub of parentSubs) {
      const remount = FOOD_SUB_REMOUNTS.find(
        (row) => norm(row.fromSub) === norm(sub.name),
      );
      if (!remount) continue;
      const targetCat = await ensureCategoryUnder(
        ctx,
        userId,
        categories,
        foodSection,
        remount.toCategory,
      );
      const targetSub = await ensureSubUnder(
        ctx,
        userId,
        subs,
        targetCat,
        remount.toSub,
      );
      if (
        sub.categoryLegacyId === targetCat.legacyId &&
        norm(sub.name) === norm(targetSub.name)
      ) {
        continue;
      }
      for (const tx of txs) {
        if (tx.subcategoryLegacyId !== sub.legacyId) continue;
        await ctx.db.patch(tx._id, {
          sectionLegacyId: foodSection.legacyId,
          categoryLegacyId: targetCat.legacyId,
          subcategoryLegacyId: targetSub.legacyId,
        });
        tx.sectionLegacyId = foodSection.legacyId;
        tx.categoryLegacyId = targetCat.legacyId;
        tx.subcategoryLegacyId = targetSub.legacyId;
      }
    }

    const fallbackName =
      norm(parent.name) === "restaurants & cafes" ? "Restaurants" : "Groceries";
    const fallback = await ensureCategoryUnder(
      ctx,
      userId,
      categories,
      foodSection,
      fallbackName,
    );
    for (const tx of txs) {
      if (tx.categoryLegacyId !== parent.legacyId) continue;
      await ctx.db.patch(tx._id, {
        sectionLegacyId: foodSection.legacyId,
        categoryLegacyId: fallback.legacyId,
      });
      tx.sectionLegacyId = foodSection.legacyId;
      tx.categoryLegacyId = fallback.legacyId;
    }
  }
}

/** Move named categories onto a new section and remount their txs. */
export async function remountCategorySectionsForUser(
  ctx: SeedDb,
  userId: Id<"users">,
) {
  if (CATEGORY_SECTION_MOVES.length === 0) return;
  const sections = await ctx.db
    .query("transactionSections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const categories = await ctx.db
    .query("transactionCategories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const txs = await ctx.db
    .query("transactions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  for (const move of CATEGORY_SECTION_MOVES) {
    const section = await ensureSection(ctx, userId, sections, move.toSection);
    const row = categories.find((category) => norm(category.name) === norm(move.name));
    if (!row || row.sectionLegacyId === section.legacyId) continue;
    await ctx.db.patch(row._id, {
      sectionLegacyId: section.legacyId,
      description: taxonomyDescription("category", row.name),
    });
    row.sectionLegacyId = section.legacyId;
    for (const tx of txs) {
      if (tx.categoryLegacyId !== row.legacyId) continue;
      if (tx.sectionLegacyId === section.legacyId) continue;
      await ctx.db.patch(tx._id, { sectionLegacyId: section.legacyId });
    }
  }

  const subs = await ctx.db
    .query("transactionSubcategories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const remount of SUBCATEGORY_REMOUNTS) {
    const section = await ensureSection(ctx, userId, sections, remount.toSection);
    const fromCat = categories.find((row) => norm(row.name) === norm(remount.fromCategory));
    if (!fromCat) continue;
    const fromSub = subs.find(
      (row) =>
        row.categoryLegacyId === fromCat.legacyId &&
        norm(row.name) === norm(remount.fromSub),
    );
    if (!fromSub) continue;
    const targetCat = await ensureCategoryUnder(
      ctx,
      userId,
      categories,
      section,
      remount.toCategory,
    );
    const targetSub = await ensureSubUnder(ctx, userId, subs, targetCat, remount.toSub);
    for (const tx of txs) {
      if (tx.subcategoryLegacyId !== fromSub.legacyId) continue;
      await ctx.db.patch(tx._id, {
        sectionLegacyId: section.legacyId,
        categoryLegacyId: targetCat.legacyId,
        subcategoryLegacyId: targetSub.legacyId,
      });
    }
  }
}
