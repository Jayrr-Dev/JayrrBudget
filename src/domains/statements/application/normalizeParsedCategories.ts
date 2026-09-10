import {
  resolveAgainstVocabulary,
  type CategoryVocabulary,
} from "@/domains/statements/application/categoryVocabulary";
import type { ParsedStatement } from "@/domains/statements/domain/parsedStatement";

/** Map freshly parsed categories onto existing vocabulary before persist. */
export function normalizeParsedCategories(
  parsed: ParsedStatement,
  vocabulary: CategoryVocabulary,
): ParsedStatement {
  return {
    ...parsed,
    transactions: parsed.transactions.map((txn) => ({
      ...txn,
      categoryPrimary: resolveAgainstVocabulary(
        txn.categoryPrimary,
        vocabulary.categoryPrimary,
      ),
      categoryDetailed: resolveAgainstVocabulary(
        txn.categoryDetailed,
        vocabulary.categoryDetailed,
      ),
    })),
  };
}
