import type { ConvexHttpClient } from "convex/browser";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { labelDescriptionGroups } from "@/domains/statements/application/categorizeStatement";
import type { CategorizationSummary } from "@/domains/statements/domain/importResult";

export async function recategorizeTransaction(
  client: ConvexHttpClient,
  input: { transactionId: string; description: string; amount: number },
): Promise<CategorizationSummary> {
  const { summary, labeled } = await labelDescriptionGroups(client, [input], {
    skipCache: true,
  });
  const label = labeled[0];
  if (!label) {
    await invalidateConvexUserCache();
    return summary;
  }
  await client.mutation(api.categorization.recategorize, {
    transactionId: label.transactionId,
    profile: label.profile,
  });
  await invalidateConvexUserCache();
  return summary;
}
