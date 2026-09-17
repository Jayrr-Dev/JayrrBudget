import { getBudgetContextForCanvas } from "@/domains/canvas/application/getBudgetContextForCanvas";
import type { CanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import { CANVAS_SYSTEM_PROMPT } from "@/domains/canvas/domain/canvasSystemPrompt";
import { createCanvasTools } from "@/domains/canvas/domain/canvasTools";
import { createLedgerReadTools } from "@/domains/ledger-ai/application/createLedgerAiTools";
import { createBudgetTools } from "@/domains/budgets/application/createBudgetTools";
import { createPiggyPingTools } from "@/domains/piggy-pings/application/createPiggyPingTools";
import { createPiggyCrewTools } from "@/domains/ledger-ai/application/piggyCrew.server";
import {
  createPiggyMemoryTools,
  loadPiggyUserContext,
  recordPiggySession,
} from "@/domains/ledger-ai/application/piggyMemory.server";
import {
  chatModel,
  getModelChain,
  webSearchTool,
} from "@/shared/ai/openRouter";
import { persistAiUsage, runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { aiCallDeniedResponse, checkAiCall } from "@/shared/ai/enforceAiCall.server";
import { aiUsageMessageMetadata } from "@/shared/ai/aiUsageMetadata";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import {
  compactModelMessages,
  prepareCompactChatStep,
} from "@/shared/ai/compactChatContext";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

export const runtime = "nodejs";
// One stream now carries the whole board (draw, explain, draw…), so give it room.
export const maxDuration = 300;

/** Pieces per request: title + ~20 pieces + arrows + frame + wrap-up. */
const MAX_STEPS = 30;

export async function POST(request: Request) {
  let convex;
  try {
    convex = await getAuthenticatedConvexClient();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    throw error;
  }

  const me = await convex.query(api.users.me, {});
  if (!me) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  if (me.role !== "admin" && me.role !== "premium") {
    return Response.json(
      { error: "Premium access required for canvas AI." },
      { status: 403 },
    );
  }

  const loaded = await loadOpenRouterKeyOr503(convex);
  if (!loaded.ok) return loaded.response;
  const gate = await checkAiCall(convex, { billedTo: loaded.billedTo });
  if (!gate.ok) return aiCallDeniedResponse(gate);

  return runMeteredOpenRouter(convex, loaded, async () => {
    let body: {
      messages?: UIMessage[];
      id?: string;
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
    const piggyUser = await loadPiggyUserContext(convex);
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
    const startedAt = Date.now();

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(messages);
    } catch (error) {
      return Response.json(
        { error: errorMessage(error, "Could not read chat messages.") },
        { status: 400 },
      );
    }

    modelMessages = await compactModelMessages({
      messages: modelMessages,
      modelId,
      fallbacks,
      client: convex,
      billedTo: loaded.billedTo,
      source: "canvas-chat",
      onSummary: async (summary) => {
        await convex.mutation(api.piggyMemory.remember, {
          lastSessionSummary: summary,
        });
      },
    });

    // Private-ledger users: plaintext stays in the browser, so no server-side
    // ledger reads and no outbound web queries built from their data.
    const serverLedger = !body.useClientBudget;
    const system = [
      CANVAS_SYSTEM_PROMPT,
      "",
      "Coordinate space: x increases right, y increases down. Origin is top-left.",
      "You may hire up to 2 helper piggies with hire_piggy, then ask_piggy_helper. They research numbers through crew mail. You still draw and talk to the user.",
      "Reminders: create_piggy_ping for toast/email/popup/banner. Cycle from the start date (Weekly, Mon, Mon,Tue, 9/16, 9/16/26, Monthly, EOM, SOM). Empty dates are indefinite. Leave trigger blank.",
      "Spend caps: create_budget for a named amount cap. warningThreshold / overageThreshold are percents (defaults 80 / 100). classLookup from taxonomy names. list_budgets first if they may already have one.",
      ...(serverLedger
        ? [
            "You can look things up yourself: list_accounts, search_transactions, summarize_spend (both take an account filter), and list_statements. Use them when the BUDGET DATA below is not enough, for example one card's spend, a statement's closing balance, or an older month.",
            "web_search reaches the public web. Use it only for general facts (rates, fees, definitions, how a bank product works). Never put balances, account names, masks, merchants, or amounts from this user's budget in a search query. Cite what you used.",
          ]
        : []),
      "",
      ...piggyUser.systemLines,
      "",
      "BUDGET DATA (JSON):",
      JSON.stringify(budget),
      "",
      "CANVAS SNAPSHOT (JSON):",
      JSON.stringify(canvas),
    ].join("\n");

    const result = streamText({
      // Reasoning streams back as "Piggy's thoughts". Do not set
      // parallelToolCalls: false — OpenRouter cheap providers omit that
      // param and return "No endpoints found" when it is required.
      model: chatModel(modelId, fallbacks, {
        reasoningEffort: "low",
      }),
      system,
      messages: modelMessages,
      tools: {
        ...createPiggyMemoryTools(convex),
        ...createPiggyPingTools(convex),
        ...createBudgetTools(convex),
        ...(serverLedger
          ? { ...createLedgerReadTools(convex), web_search: webSearchTool() }
          : {}),
        ...createPiggyCrewTools({
          client: convex,
          chatId: body.id ?? "canvas",
          modelId,
          fallbacks,
          billedTo: loaded.billedTo,
          includeLedgerReads: serverLedger,
          helperContext: JSON.stringify(budget),
        }),
        ...createCanvasTools(canvas?.shapes.map((shape) => shape.id)),
      },
      stopWhen: stepCountIs(MAX_STEPS),
      prepareStep: prepareCompactChatStep,
      temperature: 0.2,
      onError: ({ error }) => {
        console.warn(`[canvas] stream error: ${errorMessage(error)}`);
      },
      onFinish: async ({ usage }) => {
        await Promise.all([
          persistAiUsage(convex, loaded.billedTo, {
            source: "canvas-chat",
            modelId,
            usage,
            ms: Date.now() - startedAt,
          }),
          recordPiggySession(convex, "canvas"),
        ]);
      },
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return undefined;
        return aiUsageMessageMetadata({
          modelId,
          usage: part.totalUsage,
          startedAt,
        });
      },
      onError: (error) => errorMessage(error, "Canvas AI failed"),
    });
  });
}
