import { z } from "zod";

export const MAX_CSV_CHARS = 400_000;
export const CSV_AI_PREVIEW_LINES = 40;
export const CSV_AI_PREVIEW_LINE_CHARS = 400;
export const CSV_AI_EXTRACT_CHARS = 50_000;

export const normalizedCsvSchema = z.object({
  kind: z
    .enum(["columns", "rows"])
    .describe(
      "columns = map a table header; rows = extract transactions from messy text that is not a table.",
    ),
  delimiter: z
    .string()
    .nullable()
    .describe('Cell delimiter for kind=columns: ",", ";", tab, or "|".'),
  headerRowIndex: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe("0-based LINE number from the preview (the N in LINE N:)."),
  dateColumn: z.number().int().min(0).nullable(),
  descriptionColumn: z.number().int().min(0).nullable(),
  amountColumn: z.number().int().min(0).nullable(),
  debitColumn: z.number().int().min(0).nullable(),
  creditColumn: z.number().int().min(0).nullable(),
  currencyColumn: z.number().int().min(0).nullable(),
  transactions: z
    .array(
      z.object({
        date: z.string().describe("Posted or transaction date as written, prefer YYYY-MM-DD."),
        description: z.string(),
        amount: z
          .number()
          .describe("Keep the file's sign. Do not invent amounts."),
        currency: z.string().nullable(),
      }),
    )
    .describe("Only when kind=rows. Empty for kind=columns."),
});

export type NormalizedCsv = z.infer<typeof normalizedCsvSchema>;

export function csvPreviewForAi(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const preview = lines
    .slice(0, CSV_AI_PREVIEW_LINES)
    .map(
      (line, index) =>
        `LINE ${index}: ${line.slice(0, CSV_AI_PREVIEW_LINE_CHARS)}`,
    )
    .join("\n");
  const extract = text.slice(0, CSV_AI_EXTRACT_CHARS);
  return { preview, extract, truncated: text.length > CSV_AI_EXTRACT_CHARS };
}
