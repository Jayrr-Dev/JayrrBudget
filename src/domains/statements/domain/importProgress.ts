export type StatementImportStep =
  | "receive"
  | "ocr"
  | "parse"
  | "save"
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
  receive: { percent: 5, label: "Got PDF · checking if already imported…" },
  ocr: { percent: 15, label: "Scanning pages (OCR)…" },
  parse: { percent: 50, label: "Reading lines (paper-facts)…" },
  save: { percent: 85, label: "Saving to ledger…" },
  done: { percent: 100, label: "Done" },
};

export function formatImportProgress(progress: StatementImportProgress) {
  return `${progress.percent}% · ${progress.label}`;
}
