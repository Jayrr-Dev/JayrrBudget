import { tool, type InferUITool } from "ai";
import { z } from "zod";

/**
 * Client-side write: Piggy asks the browser to patch a transaction.
 * No `execute`; LedgerAiChat applies the change (vault or Convex) and
 * posts the receipt so the model can confirm.
 */
export const APPLY_BUDGET_EDIT_TOOL_NAME = "apply_budget_edit";

const nullableName = z.string().nullable().optional();

export const applyBudgetEditInputSchema = z.object({
  transactionId: z
    .string()
    .optional()
    .describe("Only if you already have it from a prior tool result"),
  date: z
    .string()
    .optional()
    .describe("YYYY-MM-DD from the row the user named"),
  amount: z.number().optional().describe("Row amount; sign is ignored"),
  query: z
    .string()
    .optional()
    .describe("Distinctive fragment of the description or merchant"),
  account: z.string().optional().describe("Account name, id, or last-4"),
  description: z.string().optional(),
  section: nullableName,
  category: nullableName,
  subcategory: nullableName,
  spread: nullableName,
  merchant: nullableName,
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
});

export const applyBudgetEditOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  transactionId: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  section: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  candidates: z
    .array(
      z.object({
        date: z.string(),
        description: z.string(),
        amount: z.number(),
      }),
    )
    .optional(),
});

export type ApplyBudgetEditInput = z.infer<typeof applyBudgetEditInputSchema>;
export type ApplyBudgetEditOutput = z.infer<typeof applyBudgetEditOutputSchema>;

export const applyBudgetEditTool = tool({
  description: [
    "Change one of the signed-in user's transactions (category, subcategory, section, description, tags).",
    "The browser applies the edit. Never tell the user to click around in the budget.",
    "Identify the row with date + amount + query from what they pasted or screenshotted. Pass all three when visible. Do not ask for a transaction id.",
    "If the receipt lists candidates, pick the one whose date and amount match what the user showed and call again with that date/amount/description. Identical duplicates: take the first. Only ask_user when the candidates differ and the user's message does not settle it.",
  ].join(" "),
  inputSchema: applyBudgetEditInputSchema,
  outputSchema: applyBudgetEditOutputSchema,
});

export type ApplyBudgetEditUITool = InferUITool<typeof applyBudgetEditTool>;
