import { createBudgetTools } from "@/domains/budgets/application/createBudgetTools";
import {
  APPLY_BUDGET_EDIT_TOOL_NAME,
  applyBudgetEditTool,
} from "@/domains/ledger-ai/domain/applyBudgetEditTool";
import {
  ASK_USER_TOOL_NAME,
  askUserTool,
} from "@/domains/ledger-ai/domain/askUserTool";
import {
  EXPORT_FILE_TOOL_NAME,
  exportFileTool,
} from "@/domains/ledger-ai/domain/exportFileTool";
import {
  SHOW_SKETCH_TOOL_NAME,
  showSketchTool,
} from "@/domains/ledger-ai/domain/sketchBoard";
import {
  vaultClientLedgerWriteTools,
  vaultClientStoreSheetWriteTools,
} from "@/domains/ledger-ai/domain/vaultLedgerWriteTools";
import { createPiggyPingTools } from "@/domains/piggy-pings/application/createPiggyPingTools";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

/** Mirror of AI_BULK_LIMIT / AI_DELETE_LIMIT in convex/transactions.ts. */
const MAX_BULK_IDS = 100;
const MAX_DELETE_IDS = 25;

const nullableName = z.string().nullable().optional();

/** Editable transaction fields shared by update_transaction and update_transactions. */
const transactionPatchSchema = {
  description: z.string().optional(),
  date: z.string().optional().describe("YYYY-MM-DD"),
  amount: z
    .number()
    .optional()
    .describe("Positive = spend, negative = money in"),
  pending: z.boolean().optional(),
  section: nullableName,
  category: nullableName,
  subcategory: nullableName,
  spread: nullableName,
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
  merchant: nullableName.describe("Merchant name; null unlinks"),
};

type ToolPatch = z.infer<z.ZodObject<typeof transactionPatchSchema>>;
type ConvexPatch = (typeof api.transactions.updateForAi._args)["patch"];

/** Drop undefined keys and map `date` -> `posted` so Convex sees only real edits. */
function toConvexPatch(patch: Partial<ToolPatch>): ConvexPatch {
  const { date, ...rest } = patch;
  const out: ConvexPatch = {};
  if (date !== undefined) out.posted = date;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function sameName(a: string | null | undefined, b: string) {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

const accountArg = z
  .string()
  .optional()
  .describe(
    "Account id, name, or last-4 digits. Narrows to one account (card, chequing, loan).",
  );

/** Users paste rows, not ids: find one transaction from date, amount, and text. */
const transactionMatchSchema = z.object({
  date: z.string().optional().describe("YYYY-MM-DD as shown on the row"),
  amount: z.number().optional().describe("Row amount; sign is ignored"),
  query: z
    .string()
    .optional()
    .describe(
      "Description or merchant text from the row (a distinctive fragment is enough)",
    ),
  account: accountArg,
});

type TransactionMatch = z.infer<typeof transactionMatchSchema>;
type AiTxnRow =
  (typeof api.transactions.searchForAi._returnType)["matches"][number];

const AMOUNT_TOLERANCE = 0.005;
/** Statement dates drift a day or two from what the user pasted. */
const DATE_WINDOW_DAYS = 3;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sameAmount(a: number, b: number) {
  return Math.abs(Math.abs(a) - Math.abs(b)) < AMOUNT_TOLERANCE;
}

type ResolvedTransaction =
  | { transaction: AiTxnRow }
  | { error: string; candidates?: AiTxnRow[] };

/**
 * Narrow to one owned transaction. Tries the exact date and text first, then
 * loosens (date window, drop text) so a slightly-off paste still lands.
 */
async function resolveTransaction(
  client: ConvexHttpClient,
  match: TransactionMatch,
): Promise<ResolvedTransaction> {
  const date = match.date?.trim();
  const query = match.query?.trim() || undefined;
  if (!date && match.amount === undefined && !query) {
    return {
      error: "Pass transactionId, or match with date, amount, and/or query.",
    };
  }
  const attempts: Array<{
    startDate?: string;
    endDate?: string;
    query?: string;
  }> = [];
  if (date) {
    attempts.push({ startDate: date, endDate: date, query });
    const wide = {
      startDate: shiftDate(date, -DATE_WINDOW_DAYS),
      endDate: shiftDate(date, DATE_WINDOW_DAYS),
    };
    attempts.push({ ...wide, query });
    if (query) attempts.push(wide);
  } else {
    attempts.push({ query });
  }

  let candidates: AiTxnRow[] = [];
  for (const attempt of attempts) {
    const found = await client.query(api.transactions.searchForAi, {
      ...attempt,
      account: match.account,
      limit: MAX_BULK_IDS,
    });
    if (found.accountNotFound) {
      return {
        error: `Account not found: ${match.account}. Call list_accounts.`,
      };
    }
    candidates =
      match.amount === undefined
        ? found.matches
        : found.matches.filter((row) => sameAmount(row.amount, match.amount!));
    if (candidates.length > 0) break;
  }

  if (candidates.length === 1) return { transaction: candidates[0]! };
  if (candidates.length === 0) {
    return {
      error:
        "No transaction matched. Try search_transactions with fewer filters, or ask the user which account it is on.",
    };
  }
  return {
    error: `${candidates.length} transactions matched. Pick the one whose date and amount match what the user showed and call again with its transactionId; if they are the same purchase repeated, take the first. Use ask_user only if they truly differ.`,
    candidates: candidates.slice(0, 10),
  };
}

async function afterWrite<T>(value: T): Promise<T> {
  await invalidateConvexUserCache();
  return value;
}

export type LedgerAiToolOptions = {
  allowLedgerWrites?: boolean;
  allowStoreSheetWrites?: boolean;
  /** Search/summarize even when writes are off (helper piggies). */
  includeLedgerReads?: boolean;
  storeSheetSnapshot?: {
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
  } | null;
};

async function loadStoreSheet(
  client: ConvexHttpClient,
  snapshot: LedgerAiToolOptions["storeSheetSnapshot"],
) {
  if (snapshot) return snapshot;
  return await client.query(api.scratchNotes.get, {});
}

function createWorkspaceTools(
  client: ConvexHttpClient,
  options: LedgerAiToolOptions,
) {
  const storeSheetWrites =
    options.allowStoreSheetWrites === false
      ? vaultClientStoreSheetWriteTools()
      : {
          add_store_sheet_row: tool({
            description:
              "Add or replace a vendor line on the store sheet. Uses the receive tab unless tabName is set. Same name+parent+currency overwrites spend and count.",
            inputSchema: z.object({
              name: z.string(),
              spend: z.number(),
              count: z.number().optional(),
              currency: z.string().optional(),
              parent: z.string().optional(),
              tabName: z.string().optional(),
            }),
            execute: async (input) => {
              const sheet = await loadStoreSheet(client, null);
              const tabName = input.tabName?.trim();
              if (tabName) {
                const tab = sheet.tabs.find(
                  (item) =>
                    sameName(item.name, tabName) || sameName(item.id, tabName),
                );
                if (!tab)
                  return { error: `Store sheet tab not found: ${tabName}` };
                await client.mutation(api.scratchNotes.setReceiveTab, {
                  tabId: tab.id,
                });
              }
              return afterWrite(
                await client.mutation(api.scratchNotes.addRow, {
                  name: input.name,
                  spend: input.spend,
                  count: input.count ?? 1,
                  currency: input.currency?.trim() || "CAD",
                  parent: input.parent,
                }),
              );
            },
          }),

          remove_store_sheet_row: tool({
            description:
              "Remove a store sheet line by row id, or by vendor name on the active tab.",
            inputSchema: z.object({
              rowId: z.string().optional(),
              name: z.string().optional(),
              tabName: z.string().optional(),
            }),
            execute: async (input) => {
              const sheet = await loadStoreSheet(client, null);
              const tabName = input.tabName?.trim();
              const tab = tabName
                ? sheet.tabs.find(
                    (item) =>
                      sameName(item.name, tabName) ||
                      sameName(item.id, tabName),
                  )
                : (sheet.tabs.find((item) => item.id === sheet.activeId) ??
                  sheet.tabs[0]);
              if (!tab) return { error: "Store sheet tab not found." };
              const target = input.rowId
                ? tab.rows.find((item) => item.id === input.rowId)
                : tab.rows.find((item) =>
                    sameName(item.name, input.name ?? ""),
                  );
              if (!target) return { error: "Store sheet row not found." };
              return afterWrite(
                await client.mutation(api.scratchNotes.removeRow, {
                  rowId: target.id,
                }),
              );
            },
          }),
        };

  return {
    // Answered in the browser (no execute); see PiggyQuestionnaire / PiggyAttachment.
    [ASK_USER_TOOL_NAME]: askUserTool,
    [EXPORT_FILE_TOOL_NAME]: exportFileTool,
    [SHOW_SKETCH_TOOL_NAME]: showSketchTool,
    [APPLY_BUDGET_EDIT_TOOL_NAME]: applyBudgetEditTool,
    ...createPiggyPingTools(client),
    ...createBudgetTools(client),

    list_store_sheet: tool({
      description:
        "Read the signed-in user's store sheet tabs and vendor lines (name, spend, count, currency).",
      inputSchema: z.object({}),
      execute: async () => {
        return await loadStoreSheet(client, options.storeSheetSnapshot);
      },
    }),

    ...storeSheetWrites,

    list_notes: tool({
      description:
        "List the signed-in user's note tabs and their text. Use before writing a note.",
      inputSchema: z.object({}),
      execute: async () => {
        return await client.query(api.userNotes.list, {});
      },
    }),

    create_note: tool({
      description:
        "Create a NEW note tab for the signed-in user. content is GitHub-flavored markdown (tables, lists, headings, fenced code) and renders in the notes panel. Fails if a tab with that name already exists (use append_note for those). Never overwrites.",
      inputSchema: z.object({
        tabName: z.string(),
        content: z.string(),
      }),
      execute: async (input) => {
        const tabName = input.tabName.trim();
        if (!tabName) return { error: "tabName is required." };
        const existing = await findNote(client, tabName);
        if (existing) {
          return {
            error: `Note "${existing.tabName}" already exists (${existing.content.length} chars). Use append_note to add to it, or pick a different tabName.`,
          };
        }
        const note = await createNoteTab(client, tabName);
        await client.mutation(api.userNotes.updateContent, {
          noteId: note.id,
          content: input.content,
        });
        return afterWrite({
          id: note.id,
          tabName: note.tabName,
          created: true,
          length: input.content.length,
        });
      },
    }),

    append_note: tool({
      description:
        "Add GitHub-flavored markdown to the END of one of the signed-in user's note tabs. Existing text is kept. Creates the tab if it does not exist yet.",
      inputSchema: z.object({
        tabName: z.string(),
        content: z.string(),
      }),
      execute: async (input) => {
        const tabName = input.tabName.trim();
        if (!tabName) return { error: "tabName is required." };
        const existing = await findNote(client, tabName);
        const note = existing ?? (await createNoteTab(client, tabName));
        const next = existing?.content
          ? `${existing.content}\n\n${input.content}`
          : input.content;
        await client.mutation(api.userNotes.updateContent, {
          noteId: note.id,
          content: next,
        });
        return afterWrite({
          id: note.id,
          tabName: note.tabName,
          created: !existing,
          appendedChars: input.content.length,
          length: next.length,
        });
      },
    }),

    replace_note: tool({
      description:
        "Overwrite the full text of an existing note tab. Destructive: only after the user explicitly asks to rewrite or clear that note and you have told them what will be lost. confirmed must be true.",
      inputSchema: z.object({
        tabName: z.string(),
        content: z.string(),
        confirmed: z.boolean(),
      }),
      execute: async (input) => {
        const tabName = input.tabName.trim();
        if (!tabName) return { error: "tabName is required." };
        const note = await findNote(client, tabName);
        if (!note) {
          return {
            error: `Note not found: ${tabName}. Use create_note instead.`,
          };
        }
        if (!input.confirmed) {
          return {
            error: `Not replaced. "${note.tabName}" has ${note.content.length} chars that would be lost. Ask the user to confirm, then call again with confirmed: true.`,
            currentContent: note.content,
          };
        }
        await client.mutation(api.userNotes.updateContent, {
          noteId: note.id,
          content: input.content,
        });
        return afterWrite({
          id: note.id,
          tabName: note.tabName,
          replaced: true,
          previousLength: note.content.length,
          length: input.content.length,
        });
      },
    }),
  };
}

async function findNote(client: ConvexHttpClient, tabName: string) {
  const notes = await client.query(api.userNotes.list, {});
  return notes.find((item) => sameName(item.tabName, tabName)) ?? null;
}

/** insertTab names the tab "Note N"; rename it right away so the user sees the asked-for name. */
async function createNoteTab(client: ConvexHttpClient, tabName: string) {
  const created = await client.mutation(api.userNotes.insertTab, {});
  return await client.mutation(api.userNotes.renameTab, {
    noteId: created.id,
    tabName,
  });
}

/** Read-only ledger tools: search, summaries, accounts, statements, taxonomy. */
export function createLedgerReadTools(client: ConvexHttpClient) {
  return {
    search_transactions: tool({
      description:
        "Search the signed-in user's transactions. Use before editing. Filter by text, merchant, taxonomy, account, or date (YYYY-MM-DD).",
      inputSchema: z.object({
        query: z.string().optional(),
        merchant: z.string().optional(),
        section: z.string().optional(),
        category: z.string().optional(),
        subcategory: z.string().optional(),
        account: accountArg,
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async (input) => {
        return await client.query(api.transactions.searchForAi, input);
      },
    }),
    summarize_spend: tool({
      description:
        "Analyze the signed-in user's spend and income grouped by merchant, section, category, or subcategory. Optional YYYY-MM-DD range and account. Own-account transfers and card payoffs are excluded and reported as transferTotal.",
      inputSchema: z.object({
        groupBy: z.enum(["merchant", "section", "category", "subcategory"]),
        account: accountArg,
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      execute: async (input) => {
        return await client.query(api.transactions.summarizeForAi, input);
      },
    }),
    list_statements: tool({
      description:
        "List the signed-in user's imported bank/card statements: period, opening and closing balance, total debits/credits, and whether the statement reconciled. Newest first. Optional account filter.",
      inputSchema: z.object({ account: accountArg }),
      execute: async (input) => {
        return await client.query(api.statements.listForAi, input);
      },
    }),
    list_taxonomy: tool({
      description:
        "List the signed-in user's sections, categories, and subcategories (names and ids).",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await client.query(api.classifications.list, {});
        return {
          sections: data.sections.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
          })),
          categories: data.categories.map((row) => ({
            id: row.id,
            name: row.name,
            section: row.sectionName,
            description: row.description,
          })),
          subcategories: data.subcategories.map((row) => ({
            id: row.id,
            name: row.name,
            category: row.categoryName,
            section: row.sectionName,
            description: row.description,
          })),
        };
      },
    }),
    list_accounts: tool({
      description:
        "List the signed-in user's accounts (name, id, last-4 mask, type/subtype, balances, currency). Use to resolve which card or account the user means, and before create_transaction.",
      inputSchema: z.object({}),
      execute: async () => {
        return await client.query(api.transactions.accountsForAi, {});
      },
    }),
  };
}

export function createLedgerAiTools(
  client: ConvexHttpClient,
  options: LedgerAiToolOptions = {},
) {
  const workspace = createWorkspaceTools(client, {
    allowStoreSheetWrites: options.allowStoreSheetWrites ?? true,
    storeSheetSnapshot: options.storeSheetSnapshot,
  });
  // Plaintext ledger money writes are retired — browser vault tools only.
  void options.allowLedgerWrites;
  const reads = createLedgerReadTools(client);
  return {
    ...workspace,
    ...vaultClientLedgerWriteTools(),
    ...(options.includeLedgerReads ? reads : {}),
  };
}

export type LedgerAiTools = ReturnType<typeof createLedgerAiTools>;
