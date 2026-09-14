import { api } from "@/shared/convex/httpClient";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

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

export async function getTransactionTaxonomy(): Promise<TransactionTaxonomy> {
  const client = await getAuthenticatedConvexClient();
  return client.query(api.transactions.taxonomy, {});
}

export { AuthRequiredError };
