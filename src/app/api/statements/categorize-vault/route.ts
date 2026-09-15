import { labelDescriptionGroups } from "@/domains/statements/application/categorizeStatement";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const client = await getAuthenticatedConvexClient();
    const body = (await request.json()) as {
      transactions?: Array<{ transactionId: string; description: string; amount: number }>;
      skipCache?: boolean;
    };
    const transactions = (body.transactions ?? []).filter(
      (row) => row.transactionId && row.description && Number.isFinite(row.amount),
    );
    if (!transactions.length) {
      return Response.json({ error: "No transactions to categorize." }, { status: 400 });
    }
    return Response.json(
      await labelDescriptionGroups(client, transactions, {
        skipCache: body.skipCache === true,
      }),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Categorization failed" },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
