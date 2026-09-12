import { classifySpread } from "@/domains/transactions/domain/spreads";
import { getDb } from "@/shared/db";
import { invalidateTursoReadCache } from "@/shared/db/readCache";
import {
  transactionCategories,
  transactionSections,
  transactionSpreads,
  transactionSubcategories,
  transactions,
} from "@/shared/db/schema";
import { eq } from "drizzle-orm";

export const TAXONOMY_FIELDS = [
  "section",
  "spread",
  "category",
  "subcategory",
] as const;

export type TaxonomyField = (typeof TAXONOMY_FIELDS)[number];

export type UpdateTransactionTaxonomyInput = {
  transactionId: string;
  field: TaxonomyField;
  /** Canonical name from lookup tables, or a new name to create, or null to clear. */
  value: string | null;
};

export type UpdateTransactionTaxonomyResult = {
  transactionId: string;
  section: string | null;
  category: string | null;
  subcategory: string | null;
  spread: string | null;
};

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isTaxonomyField(value: string): value is TaxonomyField {
  return (TAXONOMY_FIELDS as readonly string[]).includes(value);
}

/**
 * Update one spend-tree / spread field on a transaction.
 * Creates missing lookup rows when the value is new.
 * Cascades parent/child dims and refreshes Spread via classifySpread
 * (except when the user edits Spread directly).
 */
export async function updateTransactionTaxonomy(
  input: UpdateTransactionTaxonomyInput,
): Promise<UpdateTransactionTaxonomyResult> {
  const transactionId = input.transactionId.trim();
  if (!transactionId) throw new Error("transactionId is required");
  if (!isTaxonomyField(input.field)) {
    throw new Error("field must be section, spread, category, or subcategory");
  }

  const rawValue = input.value?.trim() || null;
  const db = getDb();

  const rows = await db
    .select({
      id: transactions.id,
      section: transactions.section,
      sectionId: transactions.sectionId,
      category: transactions.category,
      categoryId: transactions.categoryId,
      subcategory: transactions.subcategory,
      subcategoryId: transactions.subcategoryId,
      spread: transactions.spread,
      spreadId: transactions.spreadId,
    })
    .from(transactions)
    .where(eq(transactions.transactionId, transactionId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Transaction not found");

  let section = row.section;
  let sectionId = row.sectionId;
  let category = row.category;
  let categoryId = row.categoryId;
  let subcategory = row.subcategory;
  let subcategoryId = row.subcategoryId;
  let spread = row.spread;
  let spreadId = row.spreadId;
  const editingSpread = input.field === "spread";

  if (input.field === "section") {
    if (!rawValue) {
      section = null;
      sectionId = null;
      category = null;
      categoryId = null;
      subcategory = null;
      subcategoryId = null;
    } else {
      const match = await ensureSection(db, rawValue);
      section = match.name;
      sectionId = match.id;

      if (categoryId != null) {
        const cat = await findCategoryById(db, categoryId);
        if (!cat || (cat.sectionId != null && cat.sectionId !== sectionId)) {
          category = null;
          categoryId = null;
          subcategory = null;
          subcategoryId = null;
        }
      } else if (category && norm(category)) {
        const cat = await findCategoryByName(db, category);
        if (!cat || (cat.sectionId != null && cat.sectionId !== sectionId)) {
          category = null;
          categoryId = null;
          subcategory = null;
          subcategoryId = null;
        }
      }
    }
  } else if (input.field === "category") {
    if (!rawValue) {
      category = null;
      categoryId = null;
      subcategory = null;
      subcategoryId = null;
    } else {
      const match = await ensureCategory(db, rawValue, sectionId);
      category = match.name;
      categoryId = match.id;
      if (match.sectionId != null) {
        const parent = await findSectionById(db, match.sectionId);
        if (parent) {
          section = parent.name;
          sectionId = parent.id;
        }
      }
      if (subcategoryId != null) {
        const sub = await findSubcategoryById(db, subcategoryId);
        if (!sub || (sub.categoryId != null && sub.categoryId !== categoryId)) {
          subcategory = null;
          subcategoryId = null;
        }
      } else if (subcategory && norm(subcategory)) {
        const sub = await findSubcategoryByName(db, subcategory);
        if (!sub || (sub.categoryId != null && sub.categoryId !== categoryId)) {
          subcategory = null;
          subcategoryId = null;
        }
      }
    }
  } else if (input.field === "subcategory") {
    if (!rawValue) {
      subcategory = null;
      subcategoryId = null;
    } else {
      const match = await ensureSubcategory(db, rawValue, categoryId);
      subcategory = match.name;
      subcategoryId = match.id;
      if (match.categoryId != null) {
        const parentCat = await findCategoryById(db, match.categoryId);
        if (parentCat) {
          category = parentCat.name;
          categoryId = parentCat.id;
          if (parentCat.sectionId != null) {
            const parentSec = await findSectionById(db, parentCat.sectionId);
            if (parentSec) {
              section = parentSec.name;
              sectionId = parentSec.id;
            }
          }
        }
      }
    }
  } else if (input.field === "spread") {
    if (!rawValue) {
      spread = null;
      spreadId = null;
    } else {
      const match = await ensureSpread(db, rawValue);
      spread = match.name;
      spreadId = match.id;
    }
  }

  if (!editingSpread) {
    const nextSpread = classifySpread({ section, category, subcategory });
    if (nextSpread) {
      const match = await ensureSpread(db, nextSpread);
      spread = match.name;
      spreadId = match.id;
    } else {
      spread = null;
      spreadId = null;
    }
  }

  await db
    .update(transactions)
    .set({
      section,
      sectionId,
      category,
      categoryId,
      subcategory,
      subcategoryId,
      spread,
      spreadId,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, row.id));

  invalidateTursoReadCache();

  return {
    transactionId,
    section,
    category,
    subcategory,
    spread,
  };
}

type Db = ReturnType<typeof getDb>;

async function ensureSection(db: Db, name: string) {
  const existing = await findSection(db, name);
  if (existing) return existing;
  const inserted = await db
    .insert(transactionSections)
    .values({ name: name.trim() })
    .returning({ id: transactionSections.id, name: transactionSections.name });
  const row = inserted[0];
  if (!row) throw new Error(`Failed to create section: ${name}`);
  return row;
}

async function ensureCategory(
  db: Db,
  name: string,
  sectionId: number | null,
) {
  const existing = await findCategoryByName(db, name);
  if (existing) {
    // Link orphan categories to the row's section when possible.
    if (existing.sectionId == null && sectionId != null) {
      await db
        .update(transactionCategories)
        .set({ sectionId })
        .where(eq(transactionCategories.id, existing.id));
      return { ...existing, sectionId };
    }
    return existing;
  }
  const inserted = await db
    .insert(transactionCategories)
    .values({ name: name.trim(), sectionId })
    .returning({
      id: transactionCategories.id,
      name: transactionCategories.name,
      sectionId: transactionCategories.sectionId,
    });
  const row = inserted[0];
  if (!row) throw new Error(`Failed to create category: ${name}`);
  return row;
}

async function ensureSubcategory(
  db: Db,
  name: string,
  categoryId: number | null,
) {
  const existing = await findSubcategoryByName(db, name);
  if (existing) {
    if (existing.categoryId == null && categoryId != null) {
      await db
        .update(transactionSubcategories)
        .set({ categoryId })
        .where(eq(transactionSubcategories.id, existing.id));
      return { ...existing, categoryId };
    }
    return existing;
  }
  const inserted = await db
    .insert(transactionSubcategories)
    .values({ name: name.trim(), categoryId })
    .returning({
      id: transactionSubcategories.id,
      name: transactionSubcategories.name,
      categoryId: transactionSubcategories.categoryId,
    });
  const row = inserted[0];
  if (!row) throw new Error(`Failed to create subcategory: ${name}`);
  return row;
}

async function ensureSpread(db: Db, name: string) {
  const existing = await findSpread(db, name);
  if (existing) return existing;
  const inserted = await db
    .insert(transactionSpreads)
    .values({
      name: name.trim(),
      targetPercent: 0,
      description: "Custom",
      sortOrder: 100,
    })
    .returning({ id: transactionSpreads.id, name: transactionSpreads.name });
  const row = inserted[0];
  if (!row) throw new Error(`Failed to create spread: ${name}`);
  return row;
}

async function findSection(db: Db, name: string) {
  const rows = await db
    .select({ id: transactionSections.id, name: transactionSections.name })
    .from(transactionSections);
  return rows.find((row) => norm(row.name) === norm(name)) ?? null;
}

async function findSectionById(db: Db, id: number) {
  const rows = await db
    .select({ id: transactionSections.id, name: transactionSections.name })
    .from(transactionSections)
    .where(eq(transactionSections.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function findSpread(db: Db, name: string) {
  const rows = await db
    .select({ id: transactionSpreads.id, name: transactionSpreads.name })
    .from(transactionSpreads);
  return rows.find((row) => norm(row.name) === norm(name)) ?? null;
}

async function findCategoryByName(db: Db, name: string) {
  const rows = await db
    .select({
      id: transactionCategories.id,
      name: transactionCategories.name,
      sectionId: transactionCategories.sectionId,
    })
    .from(transactionCategories);
  return rows.find((row) => norm(row.name) === norm(name)) ?? null;
}

async function findCategoryById(db: Db, id: number) {
  const rows = await db
    .select({
      id: transactionCategories.id,
      name: transactionCategories.name,
      sectionId: transactionCategories.sectionId,
    })
    .from(transactionCategories)
    .where(eq(transactionCategories.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function findSubcategoryByName(db: Db, name: string) {
  const rows = await db
    .select({
      id: transactionSubcategories.id,
      name: transactionSubcategories.name,
      categoryId: transactionSubcategories.categoryId,
    })
    .from(transactionSubcategories);
  return rows.find((row) => norm(row.name) === norm(name)) ?? null;
}

async function findSubcategoryById(db: Db, id: number) {
  const rows = await db
    .select({
      id: transactionSubcategories.id,
      name: transactionSubcategories.name,
      categoryId: transactionSubcategories.categoryId,
    })
    .from(transactionSubcategories)
    .where(eq(transactionSubcategories.id, id))
    .limit(1);
  return rows[0] ?? null;
}
