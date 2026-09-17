import { tool, type InferUITool } from "ai";
import { z } from "zod";

/**
 * Client-side when the vault is on: Piggy asks the browser to upload the
 * attached statement. No `execute` in that mode; LedgerAiChat runs the import
 * and posts a slim receipt. Plaintext ledgers still execute this on the server.
 */
export const IMPORT_STATEMENT_DOCUMENT_TOOL_NAME = "import_statement_document";

export const importStatementDocumentInputSchema = z.object({
  documentIndex: z
    .number()
    .int()
    .min(1)
    .describe("1-based index from the attached-document note"),
});

export const importStatementDocumentOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  filename: z.string().optional(),
  duplicateFile: z.boolean().optional(),
  institutionName: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  statementPeriodStart: z.string().nullable().optional(),
  statementPeriodEnd: z.string().nullable().optional(),
  transactionCount: z.number().optional(),
  insertedCount: z.number().optional(),
  updatedCount: z.number().optional(),
  skippedCount: z.number().optional(),
  balanceOk: z.boolean().nullable().optional(),
});

export type ImportStatementDocumentInput = z.infer<
  typeof importStatementDocumentInputSchema
>;
export type ImportStatementDocumentOutput = z.infer<
  typeof importStatementDocumentOutputSchema
>;

export const IMPORT_STATEMENT_DOCUMENT_DESCRIPTION = [
  "Import an attached bank or card statement into the user's budget: OCR, parse every transaction, save them under the right account, then categorize.",
  "Use when the document is a statement and the user wants it added. Same file twice is detected and skipped.",
  "The browser may apply the save (encrypted vault). Report institution, account, period, and how many rows were added. Do not list every transaction.",
].join(" ");

export const importStatementDocumentClientTool = tool({
  description: IMPORT_STATEMENT_DOCUMENT_DESCRIPTION,
  inputSchema: importStatementDocumentInputSchema,
  outputSchema: importStatementDocumentOutputSchema,
});

export type ImportStatementDocumentUITool = InferUITool<
  typeof importStatementDocumentClientTool
>;
