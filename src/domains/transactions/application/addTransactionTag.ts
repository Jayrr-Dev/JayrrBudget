import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

export type AddTransactionTagInput = {
  transactionId: string;
  tag: string;
};

export type AddTransactionTagResult = {
  transactionId: string;
  tag: string;
  tags: string[];
  added: boolean;
};

export async function addTransactionTag(
  input: AddTransactionTagInput,
): Promise<AddTransactionTagResult> {
  const client = await getAuthenticatedConvexClient();
  const result = await client.mutation(api.transactions.addTag, {
    transactionId: input.transactionId,
    tag: input.tag,
  });
  await invalidateConvexUserCache();
  return result;
}
