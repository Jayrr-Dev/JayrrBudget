import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { classifySpread } from "./spreads";
import { taxonomyDescription } from "./taxonomyDescriptions";

/** Denormalized taxonomy columns stored on a `transactions` row. */
export type TaxonomyPathFields = {
  section: string | null;
  sectionLegacyId: number | null;
  category: string | null;
  categoryLegacyId: number | null;
  subcategory: string | null;
  subcategoryLegacyId: number | null;
  spread: string | null;
  spreadLegacyId: number | null;
};

/** Partial edit. `undefined` = leave alone, `null` = clear. */
export type TaxonomyPatch = {
  section?: string | null;
  category?: string | null;
  subcategory?: string | null;
  spread?: string | null;
};

export const EMPTY_TAXONOMY_PATH: TaxonomyPathFields = {
  section: null,
  sectionLegacyId: null,
  category: null,
  categoryLegacyId: null,
  subcategory: null,
  subcategoryLegacyId: null,
  spread: null,
  spreadLegacyId: null,
};

export function hasTaxonomyPatch(patch: TaxonomyPatch): boolean {
  return (
    patch.section !== undefined ||
    patch.category !== undefined ||
    patch.subcategory !== undefined ||
    patch.spread !== undefined
  );
}

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

type TaxonomyTable =
  | "transactionSections"
  | "transactionSpreads"
  | "transactionCategories"
  | "transactionSubcategories";

/**
 * Per-mutation cache of one user's taxonomy lookup tables.
 * Each table is read at most once; inserts are mirrored into the cache so
 * repeated lookups in the same mutation stay consistent without re-reading.
 */
export class TaxonomyStore {
  private readonly cache = new Map<TaxonomyTable, unknown[]>();

  constructor(
    private readonly ctx: MutationCtx,
    private readonly userId: Id<"users">,
  ) {}

  // All four tables share `userId` + `by_userId`; the casts below let one
  // loader serve them without four copies of the same query.
  private async rows<T extends TaxonomyTable>(table: T): Promise<Doc<T>[]> {
    const cached = this.cache.get(table);
    if (cached) return cached as Doc<T>[];
    const loaded = await this.ctx.db
      .query(table as "transactionSections")
      .withIndex("by_userId", (q) => q.eq("userId", this.userId))
      .collect();
    this.cache.set(table, loaded);
    return loaded as unknown as Doc<T>[];
  }

  private async insert<T extends TaxonomyTable>(
    table: T,
    fields: Omit<Doc<T>, "_id" | "_creationTime">,
  ): Promise<Doc<T>> {
    const rows = await this.rows(table);
    const legacyId = rows.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
    const value = { ...fields, legacyId };
    const _id = await this.ctx.db.insert(
      table as "transactionSections",
      value as unknown as Omit<Doc<"transactionSections">, "_id" | "_creationTime">,
    );
    const row = { ...value, _id, _creationTime: Date.now() } as unknown as Doc<T>;
    rows.push(row);
    return row;
  }

  sectionById(id: number) {
    return this.rows("transactionSections").then(
      (rows) => rows.find((row) => row.legacyId === id) ?? null,
    );
  }

  categoryById(id: number) {
    return this.rows("transactionCategories").then(
      (rows) => rows.find((row) => row.legacyId === id) ?? null,
    );
  }

  categoryByName(name: string) {
    return this.rows("transactionCategories").then(
      (rows) => rows.find((row) => norm(row.name) === norm(name)) ?? null,
    );
  }

  subcategoryById(id: number) {
    return this.rows("transactionSubcategories").then(
      (rows) => rows.find((row) => row.legacyId === id) ?? null,
    );
  }

  subcategoryByName(name: string) {
    return this.rows("transactionSubcategories").then(
      (rows) => rows.find((row) => norm(row.name) === norm(name)) ?? null,
    );
  }

  async ensureSection(name: string) {
    const rows = await this.rows("transactionSections");
    const existing = rows.find((row) => norm(row.name) === norm(name));
    if (existing) return existing;
    const trimmed = name.trim();
    return await this.insert("transactionSections", {
      userId: this.userId,
      legacyId: 0,
      name: trimmed,
      description: taxonomyDescription("section", trimmed),
    });
  }

  async ensureSpread(name: string) {
    const rows = await this.rows("transactionSpreads");
    const existing = rows.find((row) => norm(row.name) === norm(name));
    if (existing) return existing;
    return await this.insert("transactionSpreads", {
      userId: this.userId,
      legacyId: 0,
      name: name.trim(),
      targetPercent: 0,
      description: "Custom",
      sortOrder: 100,
    });
  }

  /** Find or create; an orphan category adopts `sectionLegacyId` as its parent. */
  async ensureCategory(name: string, sectionLegacyId: number | null) {
    const rows = await this.rows("transactionCategories");
    const existing = rows.find((row) => norm(row.name) === norm(name));
    if (existing) {
      if (existing.sectionLegacyId == null && sectionLegacyId != null) {
        await this.ctx.db.patch(existing._id, { sectionLegacyId });
        existing.sectionLegacyId = sectionLegacyId;
      }
      return existing;
    }
    const trimmed = name.trim();
    return await this.insert("transactionCategories", {
      userId: this.userId,
      legacyId: 0,
      name: trimmed,
      sectionLegacyId,
      description: taxonomyDescription("category", trimmed),
    });
  }

  /** Find or create; an orphan subcategory adopts `categoryLegacyId` as its parent. */
  async ensureSubcategory(name: string, categoryLegacyId: number | null) {
    const rows = await this.rows("transactionSubcategories");
    const existing = rows.find((row) => norm(row.name) === norm(name));
    if (existing) {
      if (existing.categoryLegacyId == null && categoryLegacyId != null) {
        await this.ctx.db.patch(existing._id, { categoryLegacyId });
        existing.categoryLegacyId = categoryLegacyId;
      }
      return existing;
    }
    const trimmed = name.trim();
    return await this.insert("transactionSubcategories", {
      userId: this.userId,
      legacyId: 0,
      name: trimmed,
      categoryLegacyId,
      description: taxonomyDescription("subcategory", trimmed),
    });
  }
}

function clearCategory(path: TaxonomyPathFields) {
  path.category = null;
  path.categoryLegacyId = null;
  clearSubcategory(path);
}

function clearSubcategory(path: TaxonomyPathFields) {
  path.subcategory = null;
  path.subcategoryLegacyId = null;
}

/**
 * Apply a taxonomy patch on top of a row's current path.
 * - Parents cascade down: picking a subcategory fills its category and section.
 * - Children are dropped when they no longer fit the new parent.
 * - Spread is recomputed from the path unless set explicitly.
 * Missing names are created in the user's lookup tables.
 */
export async function applyTaxonomyPatch(
  store: TaxonomyStore,
  current: TaxonomyPathFields,
  patch: TaxonomyPatch,
): Promise<TaxonomyPathFields> {
  // Copy only path columns; callers often pass a whole transaction row.
  const path: TaxonomyPathFields = {
    section: current.section,
    sectionLegacyId: current.sectionLegacyId,
    category: current.category,
    categoryLegacyId: current.categoryLegacyId,
    subcategory: current.subcategory,
    subcategoryLegacyId: current.subcategoryLegacyId,
    spread: current.spread,
    spreadLegacyId: current.spreadLegacyId,
  };
  if (!hasTaxonomyPatch(patch)) return path;

  if (patch.section !== undefined) {
    const value = patch.section?.trim() || null;
    if (!value) {
      path.section = null;
      path.sectionLegacyId = null;
      clearCategory(path);
    } else {
      const match = await store.ensureSection(value);
      path.section = match.name;
      path.sectionLegacyId = match.legacyId;
      if (path.categoryLegacyId != null || norm(path.category)) {
        const cat =
          path.categoryLegacyId != null
            ? await store.categoryById(path.categoryLegacyId)
            : await store.categoryByName(path.category ?? "");
        if (
          !cat ||
          (cat.sectionLegacyId != null &&
            cat.sectionLegacyId !== path.sectionLegacyId)
        ) {
          clearCategory(path);
        }
      }
    }
  }

  if (patch.category !== undefined) {
    const value = patch.category?.trim() || null;
    if (!value) {
      clearCategory(path);
    } else {
      const match = await store.ensureCategory(value, path.sectionLegacyId);
      path.category = match.name;
      path.categoryLegacyId = match.legacyId;
      if (match.sectionLegacyId != null) {
        const parent = await store.sectionById(match.sectionLegacyId);
        if (parent) {
          path.section = parent.name;
          path.sectionLegacyId = parent.legacyId;
        }
      }
      if (path.subcategoryLegacyId != null || norm(path.subcategory)) {
        const sub =
          path.subcategoryLegacyId != null
            ? await store.subcategoryById(path.subcategoryLegacyId)
            : await store.subcategoryByName(path.subcategory ?? "");
        if (
          !sub ||
          (sub.categoryLegacyId != null &&
            sub.categoryLegacyId !== path.categoryLegacyId)
        ) {
          clearSubcategory(path);
        }
      }
    }
  }

  if (patch.subcategory !== undefined) {
    const value = patch.subcategory?.trim() || null;
    if (!value) {
      clearSubcategory(path);
    } else {
      const match = await store.ensureSubcategory(value, path.categoryLegacyId);
      path.subcategory = match.name;
      path.subcategoryLegacyId = match.legacyId;
      if (match.categoryLegacyId != null) {
        const parentCat = await store.categoryById(match.categoryLegacyId);
        if (parentCat) {
          path.category = parentCat.name;
          path.categoryLegacyId = parentCat.legacyId;
          if (parentCat.sectionLegacyId != null) {
            const parentSec = await store.sectionById(parentCat.sectionLegacyId);
            if (parentSec) {
              path.section = parentSec.name;
              path.sectionLegacyId = parentSec.legacyId;
            }
          }
        }
      }
    }
  }

  if (patch.spread !== undefined) {
    const value = patch.spread?.trim() || null;
    if (!value) {
      path.spread = null;
      path.spreadLegacyId = null;
    } else {
      const match = await store.ensureSpread(value);
      path.spread = match.name;
      path.spreadLegacyId = match.legacyId;
    }
  } else {
    const next = classifySpread(path);
    if (next) {
      const match = await store.ensureSpread(next);
      path.spread = match.name;
      path.spreadLegacyId = match.legacyId;
    } else {
      path.spread = null;
      path.spreadLegacyId = null;
    }
  }

  return path;
}

/** Full path from names alone (fresh row, no prior taxonomy). */
export async function resolveTaxonomyPath(
  store: TaxonomyStore,
  patch: TaxonomyPatch,
): Promise<TaxonomyPathFields> {
  return await applyTaxonomyPatch(store, EMPTY_TAXONOMY_PATH, patch);
}
