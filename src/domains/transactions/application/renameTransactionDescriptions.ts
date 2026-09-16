import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

export type RenameTransactionDescriptionsInput = {
  from: string;
  to: string;
};

export type RenameTransactionDescriptionsResult = {
  updated: number;
};

export async function renameTransactionDescriptions(
  input: RenameTransactionDescriptionsInput,
): Promise<RenameTransactionDescriptionsResult> {
  const client = await getAuthenticatedConvexClient();
  const result = await client.mutation(api.transactions.renameDescriptions, {
    from: input.from,
    to: input.to,
  });
  await invalidateConvexUserCache();
  return result;
}
