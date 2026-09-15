import {
  resolveAgainstVocabulary,
  type CategoryVocabulary,
} from "@/domains/statements/application/categoryVocabulary";
import type { ParsedStatement } from "@/domains/statements/domain/parsedStatement";

/** Map freshly parsed tree labels onto existing vocabulary before persist. */
export function normalizeParsedCategories(
  parsed: ParsedStatement,
  vocabulary: CategoryVocabulary,
): ParsedStatement {
  return {
    ...parsed,
    transactions: parsed.transactions.map((txn) => ({
      ...txn,
      section: resolveAgainstVocabulary(txn.section, vocabulary.sections),
      category: resolveAgainstVocabulary(txn.category, vocabulary.categories),
      subcategory: resolveAgainstVocabulary(
        txn.subcategory,
        vocabulary.subcategories,
      ),
    })),
  };
}
