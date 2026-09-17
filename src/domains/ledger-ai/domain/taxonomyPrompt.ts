type TaxonomySnapshot = {
  sections: Array<{ name: string }>;
  categories: Array<{ name: string; sectionName: string | null }>;
  subcategories: Array<{ name: string; categoryName: string | null }>;
};

const UNFILED = "(no section)";
const UNFILED_CATEGORY = "(no category)";

/**
 * Renders the user's taxonomy as a compact Section > Category > Subcategory
 * tree so Piggy picks real names instead of inventing near-misses.
 */
export function formatTaxonomyPrompt(taxonomy: TaxonomySnapshot): string {
  const subsByCategory = new Map<string, string[]>();
  for (const sub of taxonomy.subcategories) {
    const key = sub.categoryName || UNFILED_CATEGORY;
    const list = subsByCategory.get(key) ?? [];
    list.push(sub.name);
    subsByCategory.set(key, list);
  }

  const categoriesBySection = new Map<string, string[]>();
  for (const category of taxonomy.categories) {
    const key = category.sectionName || UNFILED;
    const list = categoriesBySection.get(key) ?? [];
    list.push(category.name);
    categoriesBySection.set(key, list);
  }

  const sectionNames = taxonomy.sections.map((row) => row.name);
  for (const key of categoriesBySection.keys()) {
    if (!sectionNames.includes(key)) sectionNames.push(key);
  }

  if (sectionNames.length === 0) {
    return "TAXONOMY: the user has no sections, categories, or subcategories yet. Ask before creating any.";
  }

  const lines: string[] = [
    "TAXONOMY (Section > Category: Subcategories). Use these exact names and spellings. A subcategory only belongs under the category shown here.",
  ];
  for (const section of sectionNames) {
    lines.push(`- ${section}`);
    for (const category of categoriesBySection.get(section) ?? []) {
      const subs = subsByCategory.get(category) ?? [];
      lines.push(
        subs.length > 0
          ? `  - ${category}: ${subs.join(", ")}`
          : `  - ${category}`,
      );
    }
  }
  const orphanSubs = subsByCategory.get(UNFILED_CATEGORY);
  if (orphanSubs && orphanSubs.length > 0) {
    lines.push(`- ${UNFILED_CATEGORY}: ${orphanSubs.join(", ")}`);
  }
  return lines.join("\n");
}
