import {
  createDocumentTools,
  extractPiggyDocuments,
} from "@/domains/ledger-ai/application/createDocumentTools";
import {
  createJevTools,
  piggyMayUseJev,
} from "@/domains/ledger-ai/application/createJevTools";
import { createLedgerAiTools } from "@/domains/ledger-ai/application/createLedgerAiTools";
import { getLedgerAiContext } from "@/domains/ledger-ai/application/getLedgerAiContext";
import { createPiggyCrewTools } from "@/domains/ledger-ai/application/piggyCrew.server";
import {
  createPiggyMemoryTools,
  loadPiggyUserContext,
  recordPiggySession,
} from "@/domains/ledger-ai/application/piggyMemory.server";
import { PIGGY_VOICE_LINES } from "@/domains/ledger-ai/domain/piggyVoice";
import { formatTaxonomyPrompt } from "@/domains/ledger-ai/domain/taxonomyPrompt";
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
import { chatModel, getModelChain } from "@/shared/ai/openRouter";
import { loadOpenRouterKeyOr503 } from "@/shared/ai/resolveOpenRouter.server";
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
  type LanguageModelUsage,
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

    if ((body.messages ?? []).length === 0) {
      return Response.json({ error: "messages is required." }, { status: 400 });
    }

    const useClientBudget = Boolean(body.useClientBudget);
    // Attached files become server-side documents reachable through tools.
    const {
      messages,
      documents,
      error: documentError,
    } = extractPiggyDocuments(body.messages ?? []);
    const client = await getAuthenticatedConvexClient();
    const piggyUser = await loadPiggyUserContext(client);
    const jevOn = await piggyMayUseJev(client);
    // Taxonomy names are plaintext in Convex in both modes, so Piggy always
    // sees the real Section > Category > Subcategory tree.
    let taxonomyPrompt: string;
    try {
      taxonomyPrompt = formatTaxonomyPrompt(
        await client.query(api.classifications.list, {}),
      );
    } catch (error) {
      taxonomyPrompt = `TAXONOMY unavailable: ${errorMessage(error, "could not load")}. Call list_taxonomy before choosing names.`;
    }
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
      ...createDocumentTools({
        client,
        documents,
        allowLedgerWrites: !useClientBudget,
      }),
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
      ...(jevOn ? createJevTools() : {}),
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
      "Budget edits: update_transaction (one row) or update_transactions (many ids). Both take description, date, amount, section, category, subcategory, spread, addTags, removeTags, merchant in one call. Only pass fields the user asked to change; pass null to clear.",
      "Never ask the user for a transaction id. Never tell them to open the transaction list or click category fields. You make the edit with a tool.",
      "When they paste or describe a row, call apply_budget_edit (always) or update_transaction with match: date as YYYY-MM-DD, amount, and a distinctive fragment of the description. If the tool returns candidates, use ask_user so they pick, then call again. For many rows, search_transactions first, then update_transactions.",
      "Setting a subcategory fills in its category and section; setting a section drops a category that no longer fits.",
      "Categorizing: pick section, category, and subcategory only from the TAXONOMY tree below, copied exactly. Choose the most specific match (subcategory when one fits, else category, else section). Never pair a subcategory with a different category or section than the tree shows. If nothing fits, ask_user with 2 to 4 real names from the tree, or offer to create a new one; do not invent a name silently. list_taxonomy returns the same tree with ids if you need them.",
      useClientBudget
        ? "Encrypted vault: taxonomy edits (create/rename sections, categories, subcategories) from this chat are off."
        : "",
      "To fix a whole payee, use recategorize_matching with merchant or query (dryRun: true to preview). rename_descriptions renames every row with an exact description match.",
      "Taxonomy names and descriptions: create_section / update_section / create_category / update_category / create_subcategory / update_subcategory. Renames flow to linked transactions.",
      "create_transaction adds a manual line; call list_accounts first. Positive amount = spend, negative = money in.",
      "delete_transactions is permanent. Only use it when the user explicitly asks to delete, after you have listed the exact rows and they say yes. Then pass confirmed: true.",
      "When the request is ambiguous or risky, call ask_user instead of guessing: which category or account, which of several matching rows, or a yes/no before a delete. Ask 1 to 3 short questions with 2 to 6 concrete choices. Offer real names from list_taxonomy or search results as choices. After the answers arrive, act on them without re-asking.",
      "When a picture would help (split of spend, money flow, before vs after), call show_sketch. The drawing appears inline in chat; the user can tap it for a larger view. Coords are 0-100. Use rect, circle, line, arrow, text. Keep 4 to 12 shapes. Still explain in chat with a table when numbers matter.",
      "When the user wants a file, export, report, or something to print or share, call export_file. Pull the rows first (search_transactions, summaries, taxonomy), then pass columns and string rows, max 300. Use csv for spreadsheet data and pdf for a readable report with a title, subtitle, and notes. After the receipt comes back, tell the user the file is ready in one short line; do not repeat the table in chat.",
      "Attached documents: the user can drop PDFs or photos into chat. They show up as [Attached document #n] notes; the bytes are only reachable through tools. If the user says what it is, act on it: a bank or card statement goes through import_statement_document; a loan contract, disclosure, or loan statement goes through register_loan_from_document. If they did not say, call read_document on it, decide from the text, and confirm with ask_user before filing (choices: import as statement, register as loan, just answer questions about it). Receipts or one-off documents: read_document, then create_transaction if they want it recorded.",
      "After filing a document, confirm in one line: what it was, the account or loan name, and the row count. If a loan is missing terms, ask_user for exactly those fields and retry with overrides. Attachments only live for the message they were sent with; if you need one again, ask the user to attach it again.",
      documentError
        ? `Attachment warning to relay to the user: ${documentError}`
        : "",
      "For the store sheet, use add_store_sheet_row or remove_store_sheet_row.",
      "Reminders: use create_piggy_ping when they want a toast, email, popup, or banner reminder. pingTypes can include more than one. cycle is Weekly, Monthly, EOM (end of month), SOM (start of month), weekdays like Mon or Mon,Tue, a yearly day like 9/16, or a one-off date like 9/16/26. Empty startDate or endDate means that bound is indefinite. Leave trigger blank. list_piggy_pings to review. delete_piggy_ping only after they confirm.",
      "Spend caps: use create_budget when they want a budget. amount is the cap. warningThreshold and overageThreshold are percents of that cap (defaults 80 and 100). classLookup is a section, category, or subcategory name from list_taxonomy. descriptionLookup is an optional merchant or description fragment. list_budgets to review existing ones before creating a duplicate.",
      "Notes: the user's note tabs are in the context and via list_notes. Content is GitHub-flavored markdown and renders in the notes panel (tables, lists, task checks, fenced code). For a comparison or action list, write a real markdown table: header row, then | --- | --- |, then data rows. Do not dump one pipe-separated line. To save something new, use create_note (new tab) or append_note (adds to the end, keeps what is there). Never wipe a note on your own. replace_note is only for when the user explicitly asks to rewrite or clear a note; tell them what will be lost, get a yes, then pass confirmed: true.",
      "Confirm what changed in one short sentence, including how many rows.",
      "Do not mention being an AI model. You are Piggy.",
      jevOn
        ? "Jev: typed votes only (yes/no, pick-one, score). Call ask_jev when a branch is fuzzy (treat vs bill, ping vs not, which next step). Then you speak. Do not quote Jev as a paragraph."
        : "",
      "Cloud Processing notice: this chat receives readable budget, store sheet, and note context. It is not end-to-end encrypted.",
      useClientBudget
        ? "Encrypted vault is on. Answer from the budget snapshot. Budget edits: apply_budget_edit or update_transaction / update_transactions / create_transaction / delete_transactions / rename_descriptions / recategorize_matching — the browser writes encrypted rows. Import statements with import_statement_document and loans with register_loan_from_document (browser encrypts). Store sheet: add_store_sheet_row / remove_store_sheet_row (browser writes the encrypted pad)."
        : "Write tools are available for this user's plaintext budget, store sheet, and notes. Prefer apply_budget_edit or update_transaction over instructions.",
      "",
      ...piggyUser.systemLines,
      "",
      taxonomyPrompt,
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
      onError: ({ error }: { error: unknown }) => {
        console.warn(`[ledger-ai] stream error: ${errorMessage(error)}`);
      },
      onFinish: async ({ usage }: { usage: LanguageModelUsage }) => {
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
