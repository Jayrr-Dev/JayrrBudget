import { tool, type InferUITool } from "ai";
import { z } from "zod";

/**
 * Client-side tool: Piggy hands the user a CSV or PDF to download.
 * No `execute`; the browser builds the file from the tool input, shows an
 * attachment card, then posts a small receipt back so the model can continue.
 */
export const EXPORT_FILE_TOOL_NAME = "export_file";

export const MAX_EXPORT_COLUMNS = 12;
export const MAX_EXPORT_ROWS = 300;
export const MAX_EXPORT_NOTES = 20;

export const exportFileInputSchema = z.object({
  format: z.enum(["csv", "pdf"]),
  filename: z
    .string()
    .min(1)
    .max(80)
    .describe("Base name without extension, e.g. 'groceries-august'"),
  title: z.string().max(120).optional().describe("PDF heading"),
  subtitle: z
    .string()
    .max(200)
    .optional()
    .describe("PDF line under the heading, e.g. date range or total"),
  columns: z.array(z.string().max(60)).min(1).max(MAX_EXPORT_COLUMNS),
  rows: z
    .array(z.array(z.string().max(300)))
    .max(MAX_EXPORT_ROWS)
    .describe("Cells as strings, one array per row, same order as columns"),
  notes: z
    .array(z.string().max(600))
    .max(MAX_EXPORT_NOTES)
    .optional()
    .describe("PDF only: short paragraphs under the table (advice, caveats)"),
});

export const exportFileOutputSchema = z.object({
  ok: z.boolean(),
  filename: z.string(),
  format: z.enum(["csv", "pdf"]),
  rows: z.number(),
  bytes: z.number(),
  error: z.string().optional(),
});

export type ExportFileInput = z.infer<typeof exportFileInputSchema>;
export type ExportFileOutput = z.infer<typeof exportFileOutputSchema>;

export const exportFileTool = tool({
  description: [
    "Build a CSV or PDF file the user can download. Use it when the user asks for a file, export, report, statement, or something to print or share.",
    "Gather the data first (search_transactions, taxonomy, budget context), then pass it as columns and string rows. Up to 300 rows.",
    "csv: raw data the user can open in a spreadsheet. pdf: a readable report with a title, optional subtitle, the table, and optional notes.",
    "Format money as plain text like '-42.10'. The file is built in the browser; the receipt tells you if it worked.",
  ].join(" "),
  inputSchema: exportFileInputSchema,
  outputSchema: exportFileOutputSchema,
});

export type ExportFileUITool = InferUITool<typeof exportFileTool>;

const UNSAFE_FILENAME = /[^a-z0-9._-]+/gi;

/** Full download name with the right extension. */
export function exportFilename(input: Pick<ExportFileInput, "filename" | "format">) {
  const base =
    input.filename.replace(UNSAFE_FILENAME, "-").replace(/^-+|-+$/g, "") ||
    "piggy-export";
  return `${base}.${input.format}`;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV text with a UTF-8 BOM so Excel reads accents correctly. */
export function exportCsvText(input: Pick<ExportFileInput, "columns" | "rows">) {
  const lines = [input.columns, ...input.rows].map((row) =>
    row.map(csvCell).join(","),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
