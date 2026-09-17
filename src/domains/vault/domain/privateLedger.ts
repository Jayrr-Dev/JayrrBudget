export type PrivateTransaction = {
  recordId: string;
  revision: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  /** Original purchase currency when the line is FX. */
  foreignCurrency?: string | null;
  /** Original amount in foreignCurrency when printed. */
  foreignAmount?: number | null;
  /** Statement FX rate when printed. */
  exchangeRate?: number | null;
  accountId?: string | null;
  authorizedDate?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  merchantName?: string | null;
  merchantClean?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  spreadName?: string | null;
  transactionTypeName?: string | null;
  txnCode?: string | null;
  channel?: string | null;
  statementRecordId?: string | null;
  source?: string | null;
  tagNames?: string[];
  pending?: boolean;
};

export type PrivateAccount = {
  recordId: string;
  revision: number;
  accountId: string;
  name: string;
  officialName?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  currentBalance?: number | null;
  availableBalance?: number | null;
  isoCurrencyCode?: string | null;
};

export type PrivateMerchant = {
  recordId: string;
  revision: number;
  merchantId: string;
  name: string;
  rawName?: string | null;
  company?: string | null;
  brand?: string | null;
  website?: string | null;
  /** HTTPS URL or data URL; ciphertext-only in the vault envelope. */
  logoUrl?: string | null;
  /** Envelope timestamps from encryptedRecords (ms since epoch). */
  createdAt?: number;
  updatedAt?: number;
};

export type PrivateNote = {
  recordId: string;
  revision: number;
  tabId: string;
  title: string;
  content: string;
};

export type PrivateScratchPad = {
  recordId: string;
  revision: number;
  tabs: Array<{
    id: string;
    name: string;
    rows: Array<{
      id: string;
      name: string;
      spend: number;
      count: number;
      currency: string;
      parent?: string;
    }>;
  }>;
  activeId: string;
  receiveId: string;
};

export type PrivateLoanTerms = {
  recordId: string;
  revision: number;
  accountId: string;
  principal: number;
  annualRate: number;
  paymentAmount: number;
  firstPaymentDate: string;
  paymentCount: number;
  paymentFrequency?: string | null;
  loanType?: string | null;
  rateType?: string | null;
  vehicleLabel?: string | null;
  matchMerchantClean?: string | null;
  matchAmount?: number | null;
};

export type PrivateStatementLog = {
  recordId: string;
  revision: number;
  filename: string;
  fileHash: string;
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
  transactionSum: number | null;
  computedClosing: number | null;
  balanceDelta: number | null;
  balanceOk: boolean | null;
  createdAt: string;
  ocrMarkdown?: string | null;
  ocrRecordId?: string | null;
  ocrRevision?: number | null;
  transactionIds?: string[];
};

export type PrivateLoanDocument = {
  recordId: string;
  revision: number;
  filename: string;
  fileHash: string;
  status: string;
  pageCount: number | null;
  accountId: string | null;
  fields: Record<string, unknown> | null;
  createdAt: string;
  ocrMarkdown?: string | null;
  ocrRecordId?: string | null;
  ocrRevision?: number | null;
};

export type PrivateLedger = {
  transactions: PrivateTransaction[];
  accounts: PrivateAccount[];
  merchants: PrivateMerchant[];
  notes: PrivateNote[];
  scratchPads: PrivateScratchPad[];
  loans: PrivateLoanTerms[];
  statementLogs: PrivateStatementLog[];
  loanDocuments: PrivateLoanDocument[];
};
