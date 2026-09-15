export type LoanDocumentProgressStep =
  | "receive"
  | "ocr"
  | "parse"
  | "done";

export type LoanDocumentProgress = {
  step: LoanDocumentProgressStep;
  percent: number;
  label: string;
};

export const LOAN_DOCUMENT_STEPS: Record<
  LoanDocumentProgressStep,
  { percent: number; label: string }
> = {
  receive: { percent: 5, label: "Receiving PDF…" },
  ocr: { percent: 25, label: "Scanning pages (OCR)…" },
  parse: { percent: 70, label: "Reading loan terms…" },
  done: { percent: 100, label: "Done" },
};

export function formatLoanDocumentProgress(progress: LoanDocumentProgress) {
  return progress.label;
}
