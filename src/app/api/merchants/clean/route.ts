import {
  cleanSimilarMerchants,
  planSimilarMerchantMerges,
} from "@/domains/merchants/application/cleanSimilarMerchants";
import { runWithOpenRouterKey } from "@/shared/ai/openRouter";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";
import { merchantSlug } from "@convex/lib/merchantSlug";

export const runtime = "nodejs";
export const maxDuration = 300;

type ProbeBody = {
  merchants?: Array<{
    id?: string;
    name?: string;
    slug?: string;
    transactionCount?: number;
  }>;
  planOnly?: boolean;
};

export async function POST(request: Request) {
  try {
    const client = await getAuthenticatedConvexClient();
    const loaded = await loadOpenRouterKeyOr503(client);
    if (!loaded.ok) return loaded.response;
    return runWithOpenRouterKey(loaded.apiKey, async () => {
      const body = (await request.json().catch(() => ({}))) as ProbeBody;
      const probes = (body.merchants ?? [])
        .map((row) => {
          const name = row.name?.trim() ?? "";
          const id = row.id?.trim() ?? "";
          if (!name || !id) return null;
          return {
            id,
            name,
            slug: row.slug?.trim() || merchantSlug(name),
            transactionCount: Number(row.transactionCount) || 0,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);

      if (probes.length > 0 || body.planOnly) {
        const plan = await planSimilarMerchantMerges(probes);
        return Response.json({
          clustersFound: plan.clustersFound,
          mergesApplied: 0,
          merchantsDeleted: 0,
          transactionsUpdated: 0,
          merges: plan.merges,
          planOnly: true,
        });
      }

      const result = await cleanSimilarMerchants(client);
      return Response.json(result);
    });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error, "Merchant clean failed") },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
