import { createBudgetTools } from "@/domains/budgets/application/createBudgetTools";
import { getBudgetContextForCanvas } from "@/domains/canvas/application/getBudgetContextForCanvas";
import type { CanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import { CANVAS_SYSTEM_PROMPT } from "@/domains/canvas/domain/canvasSystemPrompt";
import { createCanvasTools } from "@/domains/canvas/domain/canvasTools";
import {
  createCanvasJevTools,
  piggyMayUseJev,
} from "@/domains/ledger-ai/application/createJevTools";
import { createLedgerReadTools } from "@/domains/ledger-ai/application/createLedgerAiTools";
import { createPiggyCrewTools } from "@/domains/ledger-ai/application/piggyCrew.server";
import {
  createPiggyMemoryTools,
  loadPiggyUserContext,
  recordPiggySession,
} from "@/domains/ledger-ai/application/piggyMemory.server";
import { createPiggyPingTools } from "@/domains/piggy-pings/application/createPiggyPingTools";
import {
  persistAiUsage,
  runMeteredOpenRouter,
} from "@/shared/ai/aiMeter.server";
import { aiUsageMessageMetadata } from "@/shared/ai/aiUsageMetadata";
import {
  compactModelMessages,
  prepareCompactChatStep,
} from "@/shared/ai/compactChatContext";
import {
  aiCallDeniedResponse,
  checkAiCall,
} from "@/shared/ai/enforceAiCall.server";
import {
  chatModel,
  getModelChain,
  webSearchTool,
} from "@/shared/ai/openRouter";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
import {
  AuthRequiredError,
  getAuthenticatedConvexClient,
} from "@/shared/convex/httpClient.server";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { PREMIUM_REQUIRED_MESSAGE } from "@convex/lib/aiCap";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type LanguageModelUsage,
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
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (me.role !== "admin" && me.role !== "premium") {
    return Response.json({ error: PREMIUM_REQUIRED_MESSAGE }, { status: 403 });
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
    const jevOn = await piggyMayUseJev(convex);
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
      "You may hire up to 2 helpers with hire_piggy, then ask_piggy_helper. They research numbers through crew mail. You still draw and talk to the user.",
      "Reminders: create_piggy_ping for toast/email/popup/banner. pingTypes can include more than one. Cycle from the start date (Weekly, Mon, Mon,Tue, 9/16, 9/16/26, Monthly, EOM, SOM). Empty dates are indefinite. Leave trigger blank.",
      "Spend caps: create_budget for a named amount cap. warningThreshold / overageThreshold are percents (defaults 80 / 100). classLookup from taxonomy names. list_budgets first if they may already have one.",
      ...(jevOn
        ? [
            "Typed votes are on. For any request that could get a board, the first tool call MUST be plan_board_with_jev with the user's ask. Wait for the vote. Then use_skeleton with that kind and slots, unless shouldDraw is under 0.4, then chat only. Do not skip the vote because the layout seems obvious. For treat vs need, ping vs not, or urgency, also call ask_jev. Never quote the vote as a paragraph.",
          ]
        : []),
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
      // Reasoning streams back as "Jev's thoughts". Do not set
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
        ...(jevOn ? createCanvasJevTools(canvas) : {}),
      },
      stopWhen: stepCountIs(MAX_STEPS),
      prepareStep: prepareCompactChatStep,
      temperature: 0.2,
      onError: ({ error }: { error: unknown }) => {
        console.warn(`[canvas] stream error: ${errorMessage(error)}`);
      },
      onFinish: async ({ usage }: { usage: LanguageModelUsage }) => {
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
