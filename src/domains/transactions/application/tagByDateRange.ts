import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

export type TagByDateRangeInput = {
  tag: string;
  startDate: string;
  endDate: string;
  excludeTransactionIds?: string[];
};

export type TagByDateRangeResult = {
  matched: number;
  updated: number;
  excluded?: number;
  tag: string;
  startDate: string;
  endDate: string;
};

export async function tagByDateRange(
  input: TagByDateRangeInput,
): Promise<TagByDateRangeResult> {
  const client = await getAuthenticatedConvexClient();
  const result = await client.mutation(api.transactions.tagByDateRange, {
    tag: input.tag,
    startDate: input.startDate,
    endDate: input.endDate,
    excludeTransactionIds: input.excludeTransactionIds,
  });
  await invalidateConvexUserCache();
  return result;
}
