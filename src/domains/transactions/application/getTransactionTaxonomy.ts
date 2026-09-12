import { getDb } from "@/shared/db";
import {
  transactionCategories,
  transactionSections,
  transactionSpreads,
  transactionSubcategories,
} from "@/shared/db/schema";
import { asc, eq } from "drizzle-orm";

export type TaxonomySection = { id: number; name: string };
export type TaxonomySpread = { id: number; name: string };
export type TaxonomyCategory = {
  id: number;
  name: string;
  sectionId: number | null;
  sectionName: string | null;
};
export type TaxonomySubcategory = {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
};

export type TransactionTaxonomy = {
  sections: TaxonomySection[];
  spreads: TaxonomySpread[];
  categories: TaxonomyCategory[];
  subcategories: TaxonomySubcategory[];
};

/** Lookup options for Section / Spread / Category / Subcategory editors. */
export async function getTransactionTaxonomy(): Promise<TransactionTaxonomy> {
  const db = getDb();

  const [sections, spreads, categoryRows, subcategoryRows] = await Promise.all([
    db
      .select({ id: transactionSections.id, name: transactionSections.name })
      .from(transactionSections)
      .orderBy(asc(transactionSections.name)),
    db
      .select({ id: transactionSpreads.id, name: transactionSpreads.name })
      .from(transactionSpreads)
      .orderBy(asc(transactionSpreads.sortOrder)),
    db
      .select({
        id: transactionCategories.id,
        name: transactionCategories.name,
        sectionId: transactionCategories.sectionId,
        sectionName: transactionSections.name,
      })
      .from(transactionCategories)
      .leftJoin(
        transactionSections,
        eq(transactionCategories.sectionId, transactionSections.id),
      )
      .orderBy(asc(transactionCategories.name)),
    db
      .select({
        id: transactionSubcategories.id,
        name: transactionSubcategories.name,
        categoryId: transactionSubcategories.categoryId,
        categoryName: transactionCategories.name,
      })
      .from(transactionSubcategories)
      .leftJoin(
        transactionCategories,
        eq(transactionSubcategories.categoryId, transactionCategories.id),
      )
      .orderBy(asc(transactionSubcategories.name)),
  ]);

  return {
    sections,
    spreads,
    categories: categoryRows,
    subcategories: subcategoryRows,
  };
}
