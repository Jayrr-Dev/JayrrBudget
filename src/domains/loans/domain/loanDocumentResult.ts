import type { LoanDocumentFields } from "@/domains/loans/domain/loanDocumentFields";

export type ParseLoanDocumentSuccess = {
  ok: true;
  filename: string;
  fileHash: string;
  pageCount: number;
  fields: LoanDocumentFields;
  /** Present for client-side vault encrypt; also returned in convex mode for UI. */
  ocrMarkdown: string;
  /** Convex upload id when persistMode is convex; 0 for vault. */
  uploadId: number;
};

export type ParseLoanDocumentResult =
  | ParseLoanDocumentSuccess
  | {
      ok: false;
      status: number;
      code?: string;
      error: string;
    };
