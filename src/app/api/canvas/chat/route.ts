import { getBudgetContextForCanvas } from "@/domains/canvas/application/getBudgetContextForCanvas";
import type { CanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import { CANVAS_SYSTEM_PROMPT } from "@/domains/canvas/domain/canvasSystemPrompt";
import { canvasClientTools } from "@/domains/canvas/domain/canvasTools";
import {
  chatModel,
  getModelChain,
  runWithOpenRouterKey,
} from "@/shared/ai/openRouter";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import { cachedConvexRead } from "@/shared/convex/cachedRead";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function allowRate(userId: string) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_MAX) return false;
  bucket.count += 1;
  return true;
}

export async function POST(request: Request) {
  let userKey: string;
  let role: string | undefined;
  try {
    const me = await cachedConvexRead({
      name: "users.me",
      ttlMs: 60_000,
      load: async () => {
        const client = await getAuthenticatedConvexClient();
        return client.query(api.users.me, {});
      },
    });
    if (!me) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    userKey = me.userId;
    role = me.role;
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    throw error;
  }

  if (role !== "admin" && role !== "premium") {
    return Response.json(
      { error: "Premium access required for canvas AI." },
      { status: 403 },
    );
  }

  if (!allowRate(userKey)) {
    return Response.json(
      { error: "Too many AI requests. Try again in a minute." },
      { status: 429 },
    );
  }

  const convex = await getAuthenticatedConvexClient();
  const loaded = await loadOpenRouterKeyOr503(convex);
  if (!loaded.ok) return loaded.response;

  return runWithOpenRouterKey(loaded.apiKey, async () => {
    let body: {
      messages?: UIMessage[];
      canvas?: CanvasSnapshot | null;
      budget?: unknown;
      useClientBudget?: boolean;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const messages = body.messages ?? [];
    if (messages.length === 0) {
      return Response.json({ error: "messages is required." }, { status: 400 });
    }

    const canvas = body.canvas ?? null;
    let budget: unknown;
    if (body.useClientBudget) {
      // Encrypted ledger: client already decrypted. Do not load plaintext dashboard.
      budget = body.budget ?? { error: "Client budget snapshot missing." };
    } else {
      try {
        // Uses authenticated Convex client → only this user's ledger.
        budget = await getBudgetContextForCanvas();
      } catch (error) {
        budget = {
          error: errorMessage(error, "Budget context unavailable"),
        };
      }
    }

    const [primary, ...fallbacks] = getModelChain();
    const modelId = primary ?? "google/gemini-3.8-flash";

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(messages);
    } catch (error) {
      return Response.json(
        { error: errorMessage(error, "Could not read chat messages.") },
        { status: 400 },
      );
    }

    const system = [
      CANVAS_SYSTEM_PROMPT,
      "",
      "Coordinate space: x increases right, y increases down. Origin is top-left.",
      "",
      "BUDGET DATA (JSON):",
      JSON.stringify(budget),
      "",
      "CANVAS SNAPSHOT (JSON):",
      JSON.stringify(canvas),
    ].join("\n");

    const result = streamText({
      model: chatModel(modelId, fallbacks),
      system,
      messages: modelMessages,
      tools: canvasClientTools,
      stopWhen: stepCountIs(6),
      temperature: 0.2,
      onError: ({ error }) => {
        console.warn(`[canvas] stream error: ${errorMessage(error)}`);
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => errorMessage(error, "Canvas AI failed"),
    });
  });
}
