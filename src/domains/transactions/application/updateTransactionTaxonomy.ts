import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

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
  value: string | null;
};

export type UpdateTransactionTaxonomyResult = {
  transactionId: string;
  section: string | null;
  category: string | null;
  subcategory: string | null;
  spread: string | null;
};

export async function updateTransactionTaxonomy(
  input: UpdateTransactionTaxonomyInput,
): Promise<UpdateTransactionTaxonomyResult> {
  const client = await getAuthenticatedConvexClient();
  const result = await client.mutation(api.transactions.updateTaxonomy, {
    transactionId: input.transactionId,
    field: input.field,
    value: input.value,
  });
  await invalidateConvexUserCache();
  return result;
}
