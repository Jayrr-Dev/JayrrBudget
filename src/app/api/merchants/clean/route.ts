import {
  cleanSimilarMerchants,
  planSimilarMerchantMerges,
} from "@/domains/merchants/application/cleanSimilarMerchants";
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { aiCallDeniedResponse, checkAiCall } from "@/shared/ai/enforceAiCall.server";
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
    const gate = await checkAiCall(client, { billedTo: loaded.billedTo });
    if (!gate.ok) return aiCallDeniedResponse(gate);
    return runMeteredOpenRouter(client, loaded, async () => {
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
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: unknown) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };
            try {
              const plan = await planSimilarMerchantMerges(probes, (checked, total) => {
                send({ type: "progress", checked, total });
              });
              send({
                type: "result",
                clustersFound: plan.clustersFound,
                mergesApplied: 0,
                merchantsDeleted: 0,
                transactionsUpdated: 0,
                merges: plan.merges,
                planOnly: true,
              });
            } catch (error) {
              send({
                type: "error",
                error: errorMessage(error, "Merchant clean failed"),
              });
            }
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
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
