export type StatementImportStep =
  | "receive"
  | "ocr"
  | "parse"
  | "save"
  | "categorize"
  | "done";

export type StatementImportProgress = {
  step: StatementImportStep;
  /** 0-100 */
  percent: number;
  label: string;
};

export const STATEMENT_IMPORT_STEPS: Record<
  StatementImportStep,
  { percent: number; label: string }
> = {
  receive: { percent: 5, label: "Got file · checking if already imported…" },
  ocr: { percent: 15, label: "Scanning pages (OCR)…" },
  parse: { percent: 50, label: "Reading lines…" },
  save: { percent: 85, label: "Saving to ledger…" },
  categorize: { percent: 90, label: "Categorizing transactions…" },
  done: { percent: 100, label: "Done" },
};

const PARSE_START = STATEMENT_IMPORT_STEPS.parse.percent;
const PARSE_END = STATEMENT_IMPORT_STEPS.save.percent - 3;

/** Page-level parse updates between 50% and just under save. */
export function paperFactsParseProgress(input: {
  pageCount: number;
  pagesDone: number;
  label: string;
}): StatementImportProgress {
  const total = Math.max(1, input.pageCount);
  const done = Math.min(Math.max(0, input.pagesDone), total);
  const span = PARSE_END - PARSE_START;
  const percent = PARSE_START + Math.round((done / total) * span);
  return { step: "parse", percent, label: input.label };
}

export function formatImportProgress(progress: StatementImportProgress) {
  return `${progress.percent}% · ${progress.label}`;
}
