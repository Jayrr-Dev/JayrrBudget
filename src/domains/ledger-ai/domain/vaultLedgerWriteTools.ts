import { tool, type InferUITool } from "ai";
import { z } from "zod";

const nullableName = z.string().nullable().optional();

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

const transactionMatchSchema = z.object({
  date: z.string().optional().describe("YYYY-MM-DD as shown on the row"),
  amount: z.number().optional().describe("Row amount; sign is ignored"),
  query: z
    .string()
    .optional()
    .describe("Description or merchant text from the row"),
  account: z.string().optional().describe("Account id, name, or last-4"),
});

/** Client-side vault write tools (no execute). LedgerAiChat applies them. */

export const CREATE_TRANSACTION_TOOL_NAME = "create_transaction";
export const UPDATE_TRANSACTION_TOOL_NAME = "update_transaction";
export const UPDATE_TRANSACTIONS_TOOL_NAME = "update_transactions";
export const DELETE_TRANSACTIONS_TOOL_NAME = "delete_transactions";
export const RENAME_DESCRIPTIONS_TOOL_NAME = "rename_descriptions";
export const RECATEGORIZE_MATCHING_TOOL_NAME = "recategorize_matching";
export const ADD_STORE_SHEET_ROW_TOOL_NAME = "add_store_sheet_row";
export const REMOVE_STORE_SHEET_ROW_TOOL_NAME = "remove_store_sheet_row";

export const createTransactionInputSchema = z.object({
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
});

export const createTransactionOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  transactionId: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
});

export const updateTransactionInputSchema = z.object({
  transactionId: z.string().optional(),
  match: transactionMatchSchema.optional(),
  ...transactionPatchSchema,
});

export const updateTransactionOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  transactionId: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  section: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  updatedCount: z.number().optional(),
  candidates: z
    .array(
      z.object({
        date: z.string(),
        description: z.string(),
        amount: z.number(),
        transactionId: z.string().optional(),
      }),
    )
    .optional(),
});

export const updateTransactionsInputSchema = z.object({
  transactionIds: z.array(z.string()).min(1).max(100),
  ...transactionPatchSchema,
});

export const deleteTransactionsInputSchema = z.object({
  transactionIds: z.array(z.string()).min(1).max(25),
  confirmed: z.boolean(),
});

export const deleteTransactionsOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  removed: z.number().optional(),
});

export const renameDescriptionsInputSchema = z.object({
  from: z.string(),
  to: z.string(),
  section: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
});

export const renameDescriptionsOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  renamed: z.number().optional(),
});

export const recategorizeMatchingInputSchema = z.object({
  merchant: z.string().optional(),
  query: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  section: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  dryRun: z.boolean().optional(),
});

export const recategorizeMatchingOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  dryRun: z.boolean().optional(),
  wouldUpdate: z.number().optional(),
  updatedCount: z.number().optional(),
  matches: z
    .array(
      z.object({
        transactionId: z.string(),
        date: z.string(),
        description: z.string(),
        amount: z.number(),
      }),
    )
    .optional(),
});

export const addStoreSheetRowInputSchema = z.object({
  name: z.string(),
  spend: z.number(),
  count: z.number().optional(),
  currency: z.string().optional(),
  parent: z.string().optional(),
  tabName: z.string().optional(),
});

export const removeStoreSheetRowInputSchema = z.object({
  rowId: z.string().optional(),
  name: z.string().optional(),
  tabName: z.string().optional(),
});

export const storeSheetWriteOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  tabId: z.string().optional(),
  rowId: z.string().optional(),
  removed: z.boolean().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;
export type CreateTransactionOutput = z.infer<typeof createTransactionOutputSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;
export type UpdateTransactionOutput = z.infer<typeof updateTransactionOutputSchema>;
export type UpdateTransactionsInput = z.infer<typeof updateTransactionsInputSchema>;
export type DeleteTransactionsInput = z.infer<typeof deleteTransactionsInputSchema>;
export type DeleteTransactionsOutput = z.infer<typeof deleteTransactionsOutputSchema>;
export type RenameDescriptionsInput = z.infer<typeof renameDescriptionsInputSchema>;
export type RenameDescriptionsOutput = z.infer<typeof renameDescriptionsOutputSchema>;
export type RecategorizeMatchingInput = z.infer<typeof recategorizeMatchingInputSchema>;
export type RecategorizeMatchingOutput = z.infer<typeof recategorizeMatchingOutputSchema>;
export type AddStoreSheetRowInput = z.infer<typeof addStoreSheetRowInputSchema>;
export type RemoveStoreSheetRowInput = z.infer<typeof removeStoreSheetRowInputSchema>;
export type StoreSheetWriteOutput = z.infer<typeof storeSheetWriteOutputSchema>;

export const createTransactionClientTool = tool({
  description:
    "Add a manual transaction to one of the signed-in user's accounts. amount: positive = spend, negative = money in. date is YYYY-MM-DD. The browser writes the encrypted vault row.",
  inputSchema: createTransactionInputSchema,
  outputSchema: createTransactionOutputSchema,
});

export const updateTransactionClientTool = tool({
  description:
    "Edit one of the signed-in user's transactions: description, date, amount, section/category/subcategory/spread, tags, merchant. Identify with transactionId or match (date, amount, query). The browser writes the encrypted row.",
  inputSchema: updateTransactionInputSchema,
  outputSchema: updateTransactionOutputSchema,
});

export const updateTransactionsClientTool = tool({
  description:
    "Apply the same edit to a list of transaction ids (max 100). The browser writes encrypted rows.",
  inputSchema: updateTransactionsInputSchema,
  outputSchema: updateTransactionOutputSchema,
});

export const deleteTransactionsClientTool = tool({
  description:
    "Permanently delete up to 25 transactions by id. Only after the user explicitly asks and confirms. confirmed must be true. The browser removes encrypted rows.",
  inputSchema: deleteTransactionsInputSchema,
  outputSchema: deleteTransactionsOutputSchema,
});

export const renameDescriptionsClientTool = tool({
  description:
    "Rename every transaction whose description exactly matches `from` to `to`. Optional taxonomy overlay. The browser writes encrypted rows.",
  inputSchema: renameDescriptionsInputSchema,
  outputSchema: renameDescriptionsOutputSchema,
});

export const recategorizeMatchingClientTool = tool({
  description:
    "Find transactions by merchant and/or text (optional date range), then apply one section/category/subcategory to all of them (max 100). Set dryRun to preview. The browser writes encrypted rows.",
  inputSchema: recategorizeMatchingInputSchema,
  outputSchema: recategorizeMatchingOutputSchema,
});

export const addStoreSheetRowClientTool = tool({
  description:
    "Add or replace a vendor line on the store sheet. Uses the receive tab unless tabName is set. The browser writes the encrypted pad.",
  inputSchema: addStoreSheetRowInputSchema,
  outputSchema: storeSheetWriteOutputSchema,
});

export const removeStoreSheetRowClientTool = tool({
  description:
    "Remove a store sheet line by row id, or by vendor name on the active tab. The browser writes the encrypted pad.",
  inputSchema: removeStoreSheetRowInputSchema,
  outputSchema: storeSheetWriteOutputSchema,
});

export type CreateTransactionUITool = InferUITool<typeof createTransactionClientTool>;
export type UpdateTransactionUITool = InferUITool<typeof updateTransactionClientTool>;
export type UpdateTransactionsUITool = InferUITool<typeof updateTransactionsClientTool>;
export type DeleteTransactionsUITool = InferUITool<typeof deleteTransactionsClientTool>;
export type RenameDescriptionsUITool = InferUITool<typeof renameDescriptionsClientTool>;
export type RecategorizeMatchingUITool = InferUITool<
  typeof recategorizeMatchingClientTool
>;
export type AddStoreSheetRowUITool = InferUITool<typeof addStoreSheetRowClientTool>;
export type RemoveStoreSheetRowUITool = InferUITool<
  typeof removeStoreSheetRowClientTool
>;

/** Client-only ledger write tools when the vault is the money store. */
export function vaultClientLedgerWriteTools() {
  return {
    [CREATE_TRANSACTION_TOOL_NAME]: createTransactionClientTool,
    [UPDATE_TRANSACTION_TOOL_NAME]: updateTransactionClientTool,
    [UPDATE_TRANSACTIONS_TOOL_NAME]: updateTransactionsClientTool,
    [DELETE_TRANSACTIONS_TOOL_NAME]: deleteTransactionsClientTool,
    [RENAME_DESCRIPTIONS_TOOL_NAME]: renameDescriptionsClientTool,
    [RECATEGORIZE_MATCHING_TOOL_NAME]: recategorizeMatchingClientTool,
  };
}

export function vaultClientStoreSheetWriteTools() {
  return {
    [ADD_STORE_SHEET_ROW_TOOL_NAME]: addStoreSheetRowClientTool,
    [REMOVE_STORE_SHEET_ROW_TOOL_NAME]: removeStoreSheetRowClientTool,
  };
}
