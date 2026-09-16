import { recategorizeTransaction } from "@/domains/transactions/application/recategorizeTransaction";
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
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
    const body = (await request.json()) as {
      transactionId?: string;
      description?: string;
      amount?: number;
    };
    const transactionId = body.transactionId?.trim() ?? "";
    const description = body.description?.trim() ?? "";
    const amount = Number(body.amount);
    if (!transactionId || !description || !Number.isFinite(amount)) {
      return Response.json(
        { error: "Transaction is incomplete." },
        { status: 400 },
      );
    }
    return runMeteredOpenRouter(client, loaded, async () =>
      Response.json(
        await recategorizeTransaction(client, {
          transactionId,
          description,
          amount,
        }),
      ),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Recategorize failed" },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
