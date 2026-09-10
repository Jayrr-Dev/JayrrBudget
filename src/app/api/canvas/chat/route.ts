import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getBudgetContextForCanvas } from "@/domains/canvas/application/getBudgetContextForCanvas";
import { canvasClientTools } from "@/domains/canvas/domain/canvasTools";
import {
  chatModel,
  getModelChain,
  isOpenRouterConfigured,
} from "@/shared/ai/openRouter";
import { errorMessage } from "@/shared/lib/error-message";
import type { CanvasSnapshot } from "@/domains/canvas/domain/canvasContext";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isOpenRouterConfigured()) {
    return Response.json(
      {
        error: "Missing OPENROUTER_API_KEY. Add it to .env.local.",
        code: "OPENROUTER_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  let body: {
    messages?: UIMessage[];
    canvas?: CanvasSnapshot | null;
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
    return Response.json(
      { error: "messages is required." },
      { status: 400 },
    );
  }

  const canvas = body.canvas ?? null;
  let budget: unknown;
  try {
    budget = await getBudgetContextForCanvas();
  } catch (error) {
    budget = {
      error: errorMessage(error, "Budget context unavailable"),
    };
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
    "You are the JayrrBudget canvas assistant inside tldraw.",
    "You can read the live canvas snapshot and the user's budget ledger.",
    "When the user asks to draw, rearrange, label, or clear the board, use tools.",
    "Keep layouts readable: space shapes, use short labels, prefer geo + text/notes.",
    "Coordinate space: x increases right, y increases down. Origin is top-left.",
    "After tool calls, briefly say what changed.",
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
}
