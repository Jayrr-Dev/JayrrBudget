import type { LoanDocumentFields } from "@/domains/loans/domain/loanDocumentFields";

export type ParseLoanDocumentSuccess = {
  ok: true;
  filename: string;
  fileHash: string;
  pageCount: number;
  fields: LoanDocumentFields;
  /** Present for client-side vault encrypt; also returned in convex mode for UI. */
  ocrMarkdown: string;
  /** Always 0; OCR is returned for client encrypt. */
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
