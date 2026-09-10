export type ImportHygieneSummary = {
  ok: boolean;
  consolidateMerges: number;
  rulesMatched: number;
  aiUpdated: number;
  error?: string;
};

export type ImportEnrichmentSummary = {
  ok: boolean;
  enriched: number;
  failed: number;
  error?: string;
};

export type ImportBankStatementSuccess = {
  ok: true;
  uploadId: number;
  transactionCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  removedTwinCount: number;
  duplicateFile: boolean;
  institutionName: string | null;
  accountName: string | null;
  pageCount: number;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactionSum: number | null;
  computedClosing: number | null;
  balanceDelta: number | null;
  balanceOk: boolean | null;
  hygiene?: ImportHygieneSummary;
  enrichment?: ImportEnrichmentSummary;
};

export type ImportBankStatementResult =
  | ImportBankStatementSuccess
  | {
      ok: false;
      status: number;
      code?: string;
      error: string;
    };
