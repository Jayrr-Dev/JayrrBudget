export type StatementUploadLog = {
  id: number;
  filename: string;
  status: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  currency: string | null;
  pageCount: number | null;
  transactionCount: number | null;
  insertedCount: number | null;
  updatedCount: number | null;
  skippedCount: number | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  totalDebits: number | null;
  totalCredits: number | null;
  transactionSum: number | null;
  computedClosing: number | null;
  balanceDelta: number | null;
  balanceOk: boolean | null;
  error: string | null;
  hasOcr: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type StatementUploadDetail = StatementUploadLog & {
  ocrMarkdown: string | null;
};
