import "server-only";

import {
  csvPreviewForAi,
  normalizedCsvSchema,
  type NormalizedCsv,
} from "@/domains/vault/domain/normalizedCsv";
import { generateObjectWithFallback } from "@/shared/ai/openRouter";

const CSV_NORMALIZE_RULES = [
  "Fix a bank or credit-card transaction export so Jev's Budget can import it.",
  "Prefer kind=columns when you can see a header row and repeating data rows.",
  "kind=rows only when this is not a usable table (prose, PDF copy-paste, mixed junk).",
  "headerRowIndex is the LINE N number from the preview, including title rows above the header.",
  "Column indexes are 0-based cells on that header row after splitting by delimiter.",
  "Date, description, and either amount or debit/credit must be identified for kind=columns.",
  "Do not invent transactions or amounts. Skip totals, running balances, and ads.",
  "Keep the file's amount sign. Debit-only values are money out (positive). Credit-only values are money in (negative) unless you are filling kind=rows from a signed amount column — then keep the written sign.",
  "Currency is ISO 4217 when present, else null.",
].join("\n");

export async function normalizeCsvWithAi(text: string): Promise<NormalizedCsv> {
  const { preview, extract, truncated } = csvPreviewForAi(text);
  const { object } = await generateObjectWithFallback({
    schema: normalizedCsvSchema,
    logLabel: "csv-normalize",
    temperature: 0,
    prompt: [
      "Normalize this transaction CSV or TSV into a column map or extracted rows.",
      CSV_NORMALIZE_RULES,
      truncated
        ? "Extract text is truncated; do not guess missing later rows."
        : null,
      "",
      "NUMBERED PREVIEW:",
      preview,
      "",
      "RAW EXTRACT:",
      extract,
    ]
      .filter((line): line is string => line != null)
      .join("\n"),
  });
  return object;
}
