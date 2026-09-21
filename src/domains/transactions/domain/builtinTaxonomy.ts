import { SEED_CATEGORY_PATHS } from "@convex/lib/seedCategoryPaths";
import type { TransactionTaxonomy } from "@/domains/transactions/application/getTransactionTaxonomy";
import { SPREAD_NAMES } from "@/domains/transactions/domain/spreads";

/** Built-in section / category / subcategory list. Same tree the ledger seeds. */
export function builtinTransactionTaxonomy(): TransactionTaxonomy {
  const sections: TransactionTaxonomy["sections"] = [];
  const categories: TransactionTaxonomy["categories"] = [];
  const subcategories: TransactionTaxonomy["subcategories"] = [];
  const sectionIds = new Map<string, number>();
  const categoryIds = new Map<string, number>();
  let nextId = 1;

  for (const path of SEED_CATEGORY_PATHS) {
    const sectionKey = path.section.trim().toLowerCase();
    let sectionId = sectionIds.get(sectionKey);
    if (!sectionId) {
      sectionId = nextId;
      nextId += 1;
      sectionIds.set(sectionKey, sectionId);
      sections.push({ id: sectionId, name: path.section });
    }

    const categoryKey = `${sectionKey}\0${path.category.trim().toLowerCase()}`;
    let categoryId = categoryIds.get(categoryKey);
    if (!categoryId) {
      categoryId = nextId;
      nextId += 1;
      categoryIds.set(categoryKey, categoryId);
      categories.push({
        id: categoryId,
        name: path.category,
        sectionId,
        sectionName: path.section,
      });
    }

    if (path.subcategory) {
      subcategories.push({
        id: nextId,
        name: path.subcategory,
        categoryId,
        categoryName: path.category,
      });
      nextId += 1;
    }
  }

  return {
    sections,
    categories,
    subcategories,
    spreads: SPREAD_NAMES.map((name, index) => ({
      id: index + 1,
      name,
    })),
  };
}
