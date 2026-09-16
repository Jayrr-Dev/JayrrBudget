import { categorizeStatement } from "@/domains/statements/application/categorizeStatement";
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { aiCallDeniedResponse, checkAiCall } from "@/shared/ai/enforceAiCall.server";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const client = await getAuthenticatedConvexClient();
    const loaded = await loadOpenRouterKeyOr503(client);
    if (!loaded.ok) return loaded.response;
    const gate = await checkAiCall(client, { billedTo: loaded.billedTo });
    if (!gate.ok) return aiCallDeniedResponse(gate);
    const { id } = await context.params;
    const uploadId = Number(id);
    if (!Number.isSafeInteger(uploadId) || uploadId < 1) {
      return Response.json({ error: "Invalid statement" }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    return runMeteredOpenRouter(client, loaded, async () =>
      Response.json(
        await categorizeStatement(client, uploadId, {
          force: body.force === true,
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
