import { normalizeCsvWithAi } from "@/domains/vault/application/normalizeCsvWithAi";
import { MAX_CSV_CHARS } from "@/domains/vault/domain/normalizedCsv";
import { runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import {
  aiCallDeniedResponse,
  checkAiCall,
} from "@/shared/ai/enforceAiCall.server";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const client = await getAuthenticatedConvexClient();
    const loaded = await loadOpenRouterKeyOr503(client);
    if (!loaded.ok) return loaded.response;
    const gate = await checkAiCall(client, { billedTo: loaded.billedTo });
    if (!gate.ok) return aiCallDeniedResponse(gate);

    return runMeteredOpenRouter(client, loaded, async () => {
      const body = (await request.json().catch(() => null)) as {
        text?: unknown;
      } | null;
      const text = typeof body?.text === "string" ? body.text : "";
      if (!text.trim()) {
        return Response.json(
          { error: "Paste or upload a CSV first." },
          { status: 400 },
        );
      }
      if (text.length > MAX_CSV_CHARS) {
        return Response.json(
          { error: "That CSV is too large to clean with AI." },
          { status: 413 },
        );
      }
      const normalized = await normalizeCsvWithAi(text);
      return Response.json(normalized);
    });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error, "Could not clean that CSV.") },
      { status: error instanceof AuthRequiredError ? 401 : 500 },
    );
  }
}
