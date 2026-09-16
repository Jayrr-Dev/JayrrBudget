import { labelDescriptionGroups } from "@/domains/statements/application/categorizeStatement";
import { runWithOpenRouterKey } from "@/shared/ai/openRouter";
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
      transactions?: Array<{
        transactionId: string;
        description: string;
        amount: number;
      }>;
      skipCache?: boolean;
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
    return runWithOpenRouterKey(loaded.apiKey, async () =>
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
