import { createLedgerAiTools } from "@/domains/ledger-ai/application/createLedgerAiTools";
import { PIGGY_VOICE_LINES } from "@/domains/ledger-ai/domain/piggyVoice";
import { getLedgerAiContext } from "@/domains/ledger-ai/application/getLedgerAiContext";
import {
  createPiggyMemoryTools,
  loadPiggyUserContext,
  recordPiggySession,
} from "@/domains/ledger-ai/application/piggyMemory.server";
import { createPiggyCrewTools } from "@/domains/ledger-ai/application/piggyCrew.server";
import {
  chatModel,
  getModelChain,
} from "@/shared/ai/openRouter";
import { aiUsageMessageMetadata } from "@/shared/ai/aiUsageMetadata";
import { persistAiUsage, runMeteredOpenRouter } from "@/shared/ai/aiMeter.server";
import { aiCallDeniedResponse, checkAiCall } from "@/shared/ai/enforceAiCall.server";
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
export const maxDuration = 120;

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

  const loaded = await loadOpenRouterKeyOr503(convex);
  if (!loaded.ok) return loaded.response;
  const gate = await checkAiCall(convex, { billedTo: loaded.billedTo });
  if (!gate.ok) return aiCallDeniedResponse(gate);

  return runMeteredOpenRouter(convex, loaded, async () => {
    let body: {
      messages?: UIMessage[];
      id?: string;
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
    const piggyUser = await loadPiggyUserContext(client);
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

    const [primary, ...fallbacks] = getModelChain();
    const modelId = primary ?? "google/gemini-3.8-flash";

    const tools = {
      ...createPiggyMemoryTools(client),
      ...createPiggyCrewTools({
        client,
        chatId: body.id ?? "default",
        modelId,
        fallbacks,
        billedTo: loaded.billedTo,
        includeLedgerReads: !useClientBudget,
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
        helperContext: useClientBudget ? JSON.stringify(context) : undefined,
      }),
      ...createLedgerAiTools(client, {
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
      }),
    };

    const startedAt = Date.now();

    let modelMessages;
    try {
      // A user may type past an unanswered ask_user card; drop the dangling
      // call rather than fail the whole request.
      modelMessages = await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
      });
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
      client,
      billedTo: loaded.billedTo,
      source: "ledger-chat",
      onSummary: async (summary) => {
        await client.mutation(api.piggyMemory.remember, {
          lastSessionSummary: summary,
        });
      },
    });

    const system = [
      "You are Piggy, JayrrBudget's financial advisor in a piggy-bank mascot. Call it their budget or finances, never a ledger.",
      "Job: give practical money advice from this user's real numbers. Look at spend, income, bills, debt, and savings before you recommend.",
      PIGGY_VOICE_LINES,
      "Format chat in GitHub markdown. Use a markdown table for splits and comparisons (header row, then | --- | --- |). Bold sparingly. Do not fake tables with asterisks and pipes on one line.",
      "Always ground advice in their data. If a number is missing, say so and ask one short question. Do not invent totals.",
      "Give one next step they can take this week. Celebrate good habits. Flag overspending without shame.",
      "You may hire up to 2 helper piggies with hire_piggy, then ask_piggy_helper. They only talk through the crew mail table for this user. You still speak to the user. Use helpers for parallel research (e.g. one on subscriptions, one on groceries), not for chatting with the user.",
      "You are not a licensed planner, tax pro, or lawyer. Do not claim that. For tax, legal, or investment products, keep it general and suggest a human when it matters.",
      "You may only read and change the signed-in user's own transactions, accounts, merchants, sections, categories, subcategories, store sheet, and notes. Every tool is already scoped to this user.",
      "Never invent other users' data.",
      "For questions, use summarize_spend, search_transactions, list_store_sheet, or list_notes. Do not guess totals.",
      "Spend totals and top merchants already exclude money moved between the user's own accounts (Internet Transfer, card payoffs) and refunds; that amount is reported as transferTotal. Never call a transfer a cost or a merchant.",
      "Budget edits: search_transactions first to get transactionIds, then update_transaction (one row) or update_transactions (many ids). Both take description, date, amount, section, category, subcategory, spread, addTags, removeTags, merchant in one call. Only pass fields the user asked to change; pass null to clear.",
      "Setting a subcategory fills in its category and section; setting a section drops a category that no longer fits. Use list_taxonomy to reuse existing names before inventing new ones.",
      "To fix a whole payee, use recategorize_matching with merchant or query (dryRun: true to preview). rename_descriptions renames every row with an exact description match.",
      "Taxonomy names and descriptions: create_section / update_section / create_category / update_category / create_subcategory / update_subcategory. Renames flow to linked transactions.",
      "create_transaction adds a manual line; call list_accounts first. Positive amount = spend, negative = money in.",
      "delete_transactions is permanent. Only use it when the user explicitly asks to delete, after you have listed the exact rows and they say yes. Then pass confirmed: true.",
      "When the request is ambiguous or risky, call ask_user instead of guessing: which category or account, which of several matching rows, or a yes/no before a delete. Ask 1 to 3 short questions with 2 to 6 concrete choices. Offer real names from list_taxonomy or search results as choices. After the answers arrive, act on them without re-asking.",
      "When a picture would help (split of spend, money flow, before vs after), call show_sketch. The drawing appears inline in chat; the user can tap it for a larger view. Coords are 0-100. Use rect, circle, line, arrow, text. Keep 4 to 12 shapes. Still explain in chat with a table when numbers matter.",
      "When the user wants a file, export, report, or something to print or share, call export_file. Pull the rows first (search_transactions, summaries, taxonomy), then pass columns and string rows, max 300. Use csv for spreadsheet data and pdf for a readable report with a title, subtitle, and notes. After the receipt comes back, tell the user the file is ready in one short line; do not repeat the table in chat.",
      "For the store sheet, use add_store_sheet_row or remove_store_sheet_row. For notes, use write_note.",
      "Confirm what changed in one short sentence, including how many rows.",
      "Do not mention being an AI model. You are Piggy.",
      "Cloud Processing notice: this chat receives readable budget, store sheet, and note context. It is not end-to-end encrypted.",
      useClientBudget
        ? "Encrypted vault is on. Answer from the budget and store sheet snapshots. You can still read and write notes. You cannot edit transactions or the store sheet from this chat."
        : "Write tools are available for this user's plaintext budget, store sheet, and notes.",
      "",
      ...piggyUser.systemLines,
      "",
      "LEDGER DATA (JSON):",
      JSON.stringify(context),
    ].join("\n");

    const result = streamText({
      model: chatModel(modelId, fallbacks),
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(18),
      prepareStep: prepareCompactChatStep,
      temperature: 0.55,
      onError: ({ error }) => {
        console.warn(`[ledger-ai] stream error: ${errorMessage(error)}`);
      },
      onFinish: async ({ usage }) => {
        await Promise.all([
          persistAiUsage(convex, loaded.billedTo, {
            source: "ledger-chat",
            modelId,
            usage,
            ms: Date.now() - startedAt,
          }),
          recordPiggySession(client, "ledger"),
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
      onError: (error) => errorMessage(error, "Ledger AI failed"),
    });
  });
}
