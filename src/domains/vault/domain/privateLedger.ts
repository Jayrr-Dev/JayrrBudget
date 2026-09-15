export type PrivateTransaction = {
  recordId: string;
  revision: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  accountId?: string | null;
  merchantName?: string | null;
  merchantClean?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  spreadName?: string | null;
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
    rows: Array<{ id: string; name: string; spend: number; count: number; currency: string; parent?: string }>;
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
  matchMerchantClean?: string | null;
  matchAmount?: number | null;
};

export type PrivateLedger = {
  transactions: PrivateTransaction[];
  accounts: PrivateAccount[];
  merchants: PrivateMerchant[];
  notes: PrivateNote[];
  scratchPads: PrivateScratchPad[];
  loans: PrivateLoanTerms[];
};
