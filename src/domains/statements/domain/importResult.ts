export type CategorizationSummary = {
  ok: boolean;
  cached: number;
  ai: number;
  pending: number;
  error?: string;
};

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
  filename?: string;
  fileHash?: string;
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
  categorization?: CategorizationSummary;
  /** Client encrypts these rows into the vault. */
  vaultPayload?: {
    accountId: string;
    accountName: string | null;
    accountType: string | null;
    accountSubtype: string | null;
    accountMask: string | null;
    currency: string;
    openingBalance: number | null;
    closingBalance: number | null;
    ocrMarkdown: string | null;
    transactions: Array<{
      transactionId: string;
      posted: string;
      authorized: string | null;
      description: string;
      amount: number;
      pending: boolean;
      city: string | null;
      region: string | null;
      country: string | null;
      foreignAmount?: number | null;
      foreignCurrency?: string | null;
      exchangeRate?: number | null;
      merchantClean?: string | null;
      sectionName?: string | null;
      categoryName?: string | null;
      subcategoryName?: string | null;
      spreadName?: string | null;
      transactionTypeName?: string | null;
      txnCode?: string | null;
      channel?: string | null;
      tagNames?: string[];
    }>;
  };
};

export type ImportBankStatementResult =
  | ImportBankStatementSuccess
  | {
      ok: false;
      status: number;
      code?: string;
      error: string;
    };
