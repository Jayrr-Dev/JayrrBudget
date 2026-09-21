import { labelDescriptionGroups } from "@/domains/statements/application/categorizeStatement";
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { aiCallDeniedResponse, checkAiCall } from "@/shared/ai/enforceAiCall.server";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const client = await getAuthenticatedConvexClient();
    const loaded = await loadOpenRouterKeyOr503(client);
    if (!loaded.ok) return loaded.response;
    const gate = await checkAiCall(client, { billedTo: loaded.billedTo });
    if (!gate.ok) return aiCallDeniedResponse(gate);
    const body = (await request.json()) as {
      transactions?: Array<{
        transactionId: string;
        description: string;
        amount: number;
      }>;
      skipCache?: boolean;
      stream?: boolean;
    };
    const transactions = (body.transactions ?? []).filter(
      (row) =>
        row.transactionId && row.description && Number.isFinite(row.amount),
    );
    if (!transactions.length) {
      return Response.json(
        { error: "No transactions to categorize." },
        { status: 400 },
      );
    }
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };
          try {
            await runMeteredOpenRouter(client, loaded, async () => {
              const result = await labelDescriptionGroups(client, transactions, {
                skipCache: body.skipCache === true,
                onLabeled: (item) => send({ type: "labeled", item }),
              });
              send({ type: "done", summary: result.summary });
            });
          } catch (error) {
            send({
              type: "error",
              error:
                error instanceof Error ? error.message : "Categorization failed",
            });
          } finally {
            controller.close();
          }
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
    return runMeteredOpenRouter(client, loaded, async () =>
      Response.json(
        await labelDescriptionGroups(client, transactions, {
          skipCache: body.skipCache === true,
        }),
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Categorization failed",
      },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
