import {
  ASK_USER_TOOL_NAME,
  askUserTool,
} from "@/domains/ledger-ai/domain/askUserTool";
import {
  SHOW_SKETCH_TOOL_NAME,
  showSketchTool,
} from "@/domains/ledger-ai/domain/sketchBoard";
import {
  EXPORT_FILE_TOOL_NAME,
  exportFileTool,
} from "@/domains/ledger-ai/domain/exportFileTool";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import type { Id } from "@convex/_generated/dataModel";
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
  return {
    // Answered in the browser (no execute); see PiggyQuestionnaire / PiggyAttachment.
    [ASK_USER_TOOL_NAME]: askUserTool,
    [EXPORT_FILE_TOOL_NAME]: exportFileTool,
    [SHOW_SKETCH_TOOL_NAME]: showSketchTool,

    list_store_sheet: tool({
      description:
        "Read the signed-in user's store sheet tabs and vendor lines (name, spend, count, currency).",
      inputSchema: z.object({}),
      execute: async () => {
        return await loadStoreSheet(client, options.storeSheetSnapshot);
      },
    }),

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
        if (!options.allowStoreSheetWrites) {
          return {
            error:
              "Encrypted vault: store sheet edits from this chat are off. Notes still work.",
          };
        }
        const sheet = await loadStoreSheet(client, null);
        const tabName = input.tabName?.trim();
        if (tabName) {
          const tab = sheet.tabs.find(
            (item) =>
              sameName(item.name, tabName) || sameName(item.id, tabName),
          );
          if (!tab) return { error: `Store sheet tab not found: ${tabName}` };
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
        if (!options.allowStoreSheetWrites) {
          return {
            error:
              "Encrypted vault: store sheet edits from this chat are off. Notes still work.",
          };
        }
        const sheet = await loadStoreSheet(client, null);
        const tabName = input.tabName?.trim();
        const tab = tabName
          ? sheet.tabs.find(
              (item) =>
                sameName(item.name, tabName) || sameName(item.id, tabName),
            )
          : (sheet.tabs.find((item) => item.id === sheet.activeId) ??
            sheet.tabs[0]);
        if (!tab) return { error: "Store sheet tab not found." };
        if (tab.id !== sheet.activeId) {
          await client.mutation(api.scratchNotes.selectTab, { tabId: tab.id });
        }
        const rowId =
          input.rowId?.trim() ||
          tab.rows.find((row) => sameName(row.name, input.name ?? ""))?.id;
        if (!rowId) {
          return { error: "Pass rowId or a matching vendor name." };
        }
        return afterWrite(
          await client.mutation(api.scratchNotes.removeRow, { rowId }),
        );
      },
    }),

    list_notes: tool({
      description:
        "List the signed-in user's note tabs and their text. Use before writing a note.",
      inputSchema: z.object({}),
      execute: async () => {
        return await client.query(api.userNotes.list, {});
      },
    }),

    write_note: tool({
      description:
        "Create or update one of the signed-in user's note tabs. replace overwrites; append adds to the end.",
      inputSchema: z.object({
        tabName: z.string(),
        content: z.string(),
        mode: z.enum(["replace", "append"]).optional(),
      }),
      execute: async (input) => {
        const tabName = input.tabName.trim();
        if (!tabName) return { error: "tabName is required." };
        let notes = await client.query(api.userNotes.list, {});
        let note = notes.find((item) => sameName(item.tabName, tabName));
        if (!note) {
          note = await client.mutation(api.userNotes.insertTab, {});
          await client.mutation(api.userNotes.renameTab, {
            noteId: note.id,
            tabName,
          });
          notes = await client.query(api.userNotes.list, {});
          note = notes.find((item) => sameName(item.tabName, tabName)) ?? note;
        }
        const mode = input.mode ?? "replace";
        const next =
          mode === "append"
            ? `${note.content}${note.content ? "\n" : ""}${input.content}`
            : input.content;
        await client.mutation(api.userNotes.updateContent, {
          noteId: note.id,
          content: next,
        });
        return afterWrite({
          id: note.id,
          tabName,
          mode,
          length: next.length,
        });
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
  const reads = {
    search_transactions: tool({
      description:
        "Search the signed-in user's transactions. Use before editing. Filter by text, merchant, taxonomy, or date (YYYY-MM-DD).",
      inputSchema: z.object({
        query: z.string().optional(),
        merchant: z.string().optional(),
        section: z.string().optional(),
        category: z.string().optional(),
        subcategory: z.string().optional(),
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
        "Analyze the signed-in user's spend and income grouped by merchant, section, category, or subcategory. Optional YYYY-MM-DD range. Own-account transfers and card payoffs are excluded and reported as transferTotal.",
      inputSchema: z.object({
        groupBy: z.enum(["merchant", "section", "category", "subcategory"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      execute: async (input) => {
        return await client.query(api.transactions.summarizeForAi, input);
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
        "List the signed-in user's accounts (name, id, currency). Use before create_transaction.",
      inputSchema: z.object({}),
      execute: async () => {
        return await client.query(api.transactions.accountsForAi, {});
      },
    }),
  };
  if (options.allowLedgerWrites === false) {
    if (options.includeLedgerReads) {
      return { ...reads, ...workspace };
    }
    return workspace;
  }
  return {
    ...reads,

    update_transaction: tool({
      description:
        "Edit one of the signed-in user's transactions in one call: description, date, amount, section/category/subcategory/spread, tags, merchant. Omit fields to leave them alone; pass null to clear. Look up transactionId with search_transactions first.",
      inputSchema: z.object({
        transactionId: z.string(),
        ...transactionPatchSchema,
      }),
      execute: async ({ transactionId, ...patch }) => {
        return afterWrite(
          await client.mutation(api.transactions.updateForAi, {
            transactionId,
            patch: toConvexPatch(patch),
          }),
        );
      },
    }),

    update_transactions: tool({
      description: `Apply the same edit to a list of the signed-in user's transactions by id (max ${MAX_BULK_IDS}). Same fields as update_transaction. Preview with search_transactions first.`,
      inputSchema: z.object({
        transactionIds: z.array(z.string()).min(1).max(MAX_BULK_IDS),
        ...transactionPatchSchema,
      }),
      execute: async ({ transactionIds, ...patch }) => {
        return afterWrite(
          await client.mutation(api.transactions.bulkUpdateForAi, {
            transactionIds,
            patch: toConvexPatch(patch),
          }),
        );
      },
    }),

    recategorize_matching: tool({
      description: `Find transactions by merchant and/or text (optional date range), then apply one section/category/subcategory to all of them (max ${MAX_BULK_IDS}). Set dryRun to preview without writing.`,
      inputSchema: z.object({
        merchant: z.string().optional(),
        query: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        section: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        subcategory: z.string().nullable().optional(),
        dryRun: z.boolean().optional(),
      }),
      execute: async (input) => {
        const patch = toConvexPatch({
          section: input.section,
          category: input.category,
          subcategory: input.subcategory,
        });
        if (Object.keys(patch).length === 0) {
          return {
            error: "Provide at least one of section, category, subcategory.",
          };
        }
        if (!input.merchant?.trim() && !input.query?.trim()) {
          return {
            error:
              "Provide merchant or query so this does not recategorize unrelated rows.",
          };
        }
        const found = await client.query(api.transactions.searchForAi, {
          query: input.query,
          merchant: input.merchant,
          startDate: input.startDate,
          endDate: input.endDate,
          limit: MAX_BULK_IDS,
        });
        const transactionIds = found.matches.map((row) => row.transactionId);
        if (input.dryRun || transactionIds.length === 0) {
          return {
            dryRun: true,
            wouldUpdate: transactionIds.length,
            truncated: found.truncated,
            matches: found.matches,
          };
        }
        const result = await client.mutation(
          api.transactions.bulkUpdateForAi,
          { transactionIds, patch },
        );
        return afterWrite({ ...result, truncated: found.truncated });
      },
    }),

    create_transaction: tool({
      description:
        "Add a manual transaction to one of the signed-in user's accounts. amount: positive = spend, negative = money in. date is YYYY-MM-DD.",
      inputSchema: z.object({
        account: z.string().describe("Account name or accountId"),
        date: z.string(),
        description: z.string(),
        amount: z.number(),
        currency: z.string().optional(),
        section: z.string().optional(),
        category: z.string().optional(),
        subcategory: z.string().optional(),
        merchant: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ date, ...rest }) => {
        return afterWrite(
          await client.mutation(api.transactions.createForAi, {
            ...rest,
            posted: date,
          }),
        );
      },
    }),

    delete_transactions: tool({
      description: `Permanently delete up to ${MAX_DELETE_IDS} of the signed-in user's transactions by id. Only after the user explicitly asks to delete and you have shown them which rows. confirmed must be true.`,
      inputSchema: z.object({
        transactionIds: z.array(z.string()).min(1).max(MAX_DELETE_IDS),
        confirmed: z.boolean(),
      }),
      execute: async (input) => {
        if (!input.confirmed) {
          return {
            error:
              "Not deleted. Ask the user to confirm, then call again with confirmed: true.",
          };
        }
        return afterWrite(
          await client.mutation(api.transactions.deleteForAi, {
            transactionIds: input.transactionIds,
          }),
        );
      },
    }),

    rename_descriptions: tool({
      description:
        "Rename every transaction whose description exactly matches `from` to `to`. Optional taxonomy overlay.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        section: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        subcategory: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const taxonomy =
          input.section !== undefined ||
          input.category !== undefined ||
          input.subcategory !== undefined
            ? {
                section: input.section ?? null,
                category: input.category ?? null,
                subcategory: input.subcategory ?? null,
              }
            : undefined;
        const result = await client.mutation(
          api.transactions.renameDescriptions,
          { from: input.from, to: input.to, taxonomy },
        );
        return afterWrite(result);
      },
    }),

    create_section: tool({
      description: "Create a section in the signed-in user's taxonomy.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        return afterWrite(
          await client.mutation(api.classifications.createSection, input),
        );
      },
    }),

    update_section: tool({
      description:
        "Rename or rewrite description for one of the signed-in user's sections. Linked transactions follow a rename.",
      inputSchema: z.object({
        currentName: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        const data = await client.query(api.classifications.list, {});
        const row = data.sections.find((item) =>
          sameName(item.name, input.currentName),
        );
        if (!row) return { error: `Section not found: ${input.currentName}` };
        return afterWrite(
          await client.mutation(api.classifications.updateSection, {
            id: row.id,
            name: input.name?.trim() || row.name,
            description: input.description,
          }),
        );
      },
    }),

    create_category: tool({
      description:
        "Create a category under an existing section in the signed-in user's taxonomy.",
      inputSchema: z.object({
        name: z.string(),
        sectionName: z.string(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        const data = await client.query(api.classifications.list, {});
        const section = data.sections.find((item) =>
          sameName(item.name, input.sectionName),
        );
        if (!section) {
          return {
            error: `Section not found: ${input.sectionName}. Create it first.`,
          };
        }
        return afterWrite(
          await client.mutation(api.classifications.createCategory, {
            name: input.name,
            sectionId: section.id,
            description: input.description,
          }),
        );
      },
    }),

    update_category: tool({
      description:
        "Rename, rewrite, or move one of the signed-in user's categories. Linked transactions follow.",
      inputSchema: z.object({
        currentName: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        sectionName: z.string().optional(),
      }),
      execute: async (input) => {
        const data = await client.query(api.classifications.list, {});
        const row = data.categories.find((item) =>
          sameName(item.name, input.currentName),
        );
        if (!row) return { error: `Category not found: ${input.currentName}` };
        let sectionId = row.sectionId;
        const sectionName = input.sectionName?.trim();
        if (sectionName) {
          const section = data.sections.find((item) =>
            sameName(item.name, sectionName),
          );
          if (!section) {
            return { error: `Section not found: ${sectionName}` };
          }
          sectionId = section.id;
        }
        if (sectionId == null) {
          return { error: "Category has no section. Pass sectionName." };
        }
        return afterWrite(
          await client.mutation(api.classifications.updateCategory, {
            id: row.id,
            name: input.name?.trim() || row.name,
            description: input.description,
            sectionId,
          }),
        );
      },
    }),

    create_subcategory: tool({
      description:
        "Create a subcategory under an existing category in the signed-in user's taxonomy.",
      inputSchema: z.object({
        name: z.string(),
        categoryName: z.string(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        const data = await client.query(api.classifications.list, {});
        const category = data.categories.find((item) =>
          sameName(item.name, input.categoryName),
        );
        if (!category) {
          return {
            error: `Category not found: ${input.categoryName}. Create it first.`,
          };
        }
        return afterWrite(
          await client.mutation(api.classifications.createSubcategory, {
            name: input.name,
            categoryId: category.id,
            description: input.description,
          }),
        );
      },
    }),

    update_subcategory: tool({
      description:
        "Rename, rewrite, or move one of the signed-in user's subcategories. Linked transactions follow.",
      inputSchema: z.object({
        currentName: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        categoryName: z.string().optional(),
      }),
      execute: async (input) => {
        const data = await client.query(api.classifications.list, {});
        const row = data.subcategories.find((item) =>
          sameName(item.name, input.currentName),
        );
        if (!row) {
          return { error: `Subcategory not found: ${input.currentName}` };
        }
        let categoryId = row.categoryId;
        const categoryName = input.categoryName?.trim();
        if (categoryName) {
          const category = data.categories.find((item) =>
            sameName(item.name, categoryName),
          );
          if (!category) {
            return { error: `Category not found: ${categoryName}` };
          }
          categoryId = category.id;
        }
        if (categoryId == null) {
          return { error: "Subcategory has no category. Pass categoryName." };
        }
        return afterWrite(
          await client.mutation(api.classifications.updateSubcategory, {
            id: row.id,
            name: input.name?.trim() || row.name,
            description: input.description,
            categoryId,
          }),
        );
      },
    }),

    rename_merchant: tool({
      description:
        "Rename one of the signed-in user's merchants. Matching an existing name merges them and relinks transactions.",
      inputSchema: z.object({
        currentName: z.string(),
        name: z.string(),
      }),
      execute: async (input) => {
        const merchants = await client.query(api.merchants.list, {});
        const row = merchants.find((item) =>
          sameName(item.name, input.currentName),
        );
        if (!row) return { error: `Merchant not found: ${input.currentName}` };
        return afterWrite(
          await client.mutation(api.merchants.update, {
            merchantId: row.id as Id<"merchants">,
            name: input.name,
          }),
        );
      },
    }),
    ...workspace,
  };
}

export type LedgerAiTools = ReturnType<typeof createLedgerAiTools>;
