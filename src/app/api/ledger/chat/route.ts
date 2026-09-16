import { createLedgerAiTools } from "@/domains/ledger-ai/application/createLedgerAiTools";
import { getLedgerAiContext } from "@/domains/ledger-ai/application/getLedgerAiContext";
import {
  chatModel,
  getModelChain,
  runWithOpenRouterKey,
} from "@/shared/ai/openRouter";
import { aiUsageMessageMetadata } from "@/shared/ai/aiUsageMetadata";
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
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    throw error;
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
      budget?: unknown;
      useClientBudget?: boolean;
      storeSheet?: unknown;
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

    const useClientBudget = Boolean(body.useClientBudget);
    const client = await getAuthenticatedConvexClient();
    let context: unknown;
    if (useClientBudget) {
      let notes: unknown = [];
      try {
        notes = await client.query(api.userNotes.list, {});
      } catch {
        notes = [];
      }
      context = {
        budget: body.budget ?? { error: "Client budget snapshot missing." },
        storeSheet: body.storeSheet ?? {
          note: "Encrypted vault: store sheet snapshot missing.",
        },
        notes,
        taxonomy: {
          note: "Encrypted vault: taxonomy edits from this chat are off.",
        },
      };
    } else {
      try {
        context = await getLedgerAiContext();
      } catch (error) {
        context = {
          error: errorMessage(error, "Ledger context unavailable"),
        };
      }
    }

    const tools = createLedgerAiTools(client, {
      allowLedgerWrites: !useClientBudget,
      allowStoreSheetWrites: !useClientBudget,
      storeSheetSnapshot: useClientBudget
        ? (body.storeSheet as {
            tabs: Array<{
              id: string;
              name: string;
              rows: Array<{
                id: string;
                name: string;
                spend: number;
                count: number;
                currency: string;
                parent?: string;
              }>;
            }>;
            activeId: string;
            receiveId: string;
          } | null)
        : null,
    });

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

    const system = [
      "You are Piggy, JayrrBudget's ledger helper: a cheerful piggy bank who loves tidy numbers.",
      "Voice: warm, playful, a little cheeky. Keep replies short. One small pig or coin pun is fine; never stack them.",
      "Celebrate good habits. Tease overspending gently. Never shame.",
      "You may only read and change the signed-in user's own transactions, merchants, sections, categories, subcategories, store sheet, and notes.",
      "Never invent other users' data. Never delete ledger rows unless the user clearly asks later; this chat has no delete tools for transactions.",
      "For questions, use summarize_spend, search_transactions, list_store_sheet, or list_notes. Do not guess totals.",
      "For ledger edits, search first, then update. For the store sheet, use add_store_sheet_row or remove_store_sheet_row. For notes, use write_note.",
      "Confirm what changed in one short sentence.",
      "Do not mention being an AI model. You are Piggy.",
      "Cloud Processing notice: this chat receives readable ledger, store sheet, and note context. It is not end-to-end encrypted.",
      useClientBudget
        ? "Encrypted vault is on. Answer from the budget and store sheet snapshots. You can still read and write notes. You cannot edit ledger rows or the store sheet from this chat."
        : "Write tools are available for this user's plaintext ledger, store sheet, and notes.",
      "",
      "LEDGER DATA (JSON):",
      JSON.stringify(context),
    ].join("\n");

    const result = streamText({
      model: chatModel(modelId, fallbacks),
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(8),
      temperature: 0.55,
      onError: ({ error }) => {
        console.warn(`[ledger-ai] stream error: ${errorMessage(error)}`);
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
      onError: (error) => errorMessage(error, "Ledger AI failed"),
    });
  });
}
