export type AnalysisRange = "1w" | "1m" | "3m" | "6m" | "12m" | "all";

export type AnalysisPeriod = "monthly" | "biweekly" | "weekly" | "daily";

export type AnalysisMonthlyPoint = {
  month: string;
  label: string;
  spend: number;
  income: number;
  transfers: number;
};

export type AnalysisRankedItem = {
  name: string;
  spend: number;
  /** Lifestyle purchase/refund rows that hit this bucket. */
  count: number;
};

export type AnalysisSummary = {
  /** Lifestyle / real outflow only - internal transfers excluded. */
  totalSpend: number;
  /** Real inflows only - card payments / internal credits excluded. */
  totalIncome: number;
  net: number;
  avgPeriodSpend: number;
  peakSpendPeriod: string | null;
  peakSpendAmount: number;
  /** Paying-side internal moves only (chequing → card). Matching visa credits excluded. */
  internalTransfers: number;
  transferCount: number;
  spendCount: number;
  /** All ledger rows in the selected range (spend, income, transfers, …). */
  transactionCount: number;
  /** transactionCount ÷ number of selected period buckets in range. */
  transactionsPerPeriod: number;
  /** totalIncome ÷ number of selected period buckets in range. */
  incomePerPeriod: number;
  refunds: number;
  inboundTransfersIgnored: number;
};

export type AnalysisCategorySeries = {
  key: string;
  label: string;
};

export type AnalysisStackedRankedBreakdown = {
  rows: Array<Record<string, string | number>>;
  series: AnalysisCategorySeries[];
  otherByRow?: Record<string, AnalysisRankedItem[]>;
};

export type AnalysisCategoryBreakdown = {
  category: string;
  spend: number;
  types: AnalysisRankedItem[];
  merchants: AnalysisRankedItem[];
  typeSeries: AnalysisCategorySeries[];
  typeMonthly: Array<Record<string, string | number>>;
  other: AnalysisRankedItem[];
  otherByPeriod: Record<string, AnalysisRankedItem[]>;
};

export type AnalysisSubcategoryBreakdown = {
  subcategory: string;
  spend: number;
  merchants: AnalysisRankedItem[];
  merchantSeries: AnalysisCategorySeries[];
  merchantMonthly: Array<Record<string, string | number>>;
  other: AnalysisRankedItem[];
  otherByPeriod: Record<string, AnalysisRankedItem[]>;
};

export type AnalysisTagBreakdown = {
  tag: string;
  spend: number;
  merchants: AnalysisRankedItem[];
  merchantSeries: AnalysisCategorySeries[];
  merchantMonthly: Array<Record<string, string | number>>;
  other: AnalysisRankedItem[];
  otherByPeriod: Record<string, AnalysisRankedItem[]>;
};

/** Dimensional Type (Fee / Subscription / …) from transactions.kind. */
export type AnalysisTypeBreakdown = {
  type: string;
  spend: number;
  merchants: AnalysisRankedItem[];
  merchantSeries: AnalysisCategorySeries[];
  merchantMonthly: Array<Record<string, string | number>>;
  other: AnalysisRankedItem[];
  otherByPeriod: Record<string, AnalysisRankedItem[]>;
};

export type AnalysisMerchantBreakdown = {
  merchant: string;
  spend: number;
  /** Categories this merchant hit, ranked by spend inside the merchant. */
  categories: AnalysisRankedItem[];
  types: AnalysisRankedItem[];
  typeSeries: AnalysisCategorySeries[];
  typeMonthly: Array<Record<string, string | number>>;
  other: AnalysisRankedItem[];
  otherByPeriod: Record<string, AnalysisRankedItem[]>;
};

export type AnalysisTxnPeek = {
  date: string;
  description: string;
  /** Positive = debit (outflow). Negative = credit (inflow/refund). */
  amount: number;
};

/**
 * Flat entry list - Convex caps objects at 1024 fields, and peek keys
 * (section/category/merchant combos) routinely exceed that as a Record.
 */
export type AnalysisTxnPeekEntry = {
  key: string;
  peeks: AnalysisTxnPeek[];
};

export type AnalysisData = {
  currency: string;
  range: AnalysisRange;
  period: AnalysisPeriod;
  earliestDate: string | null;
  latestDate: string | null;
  transactionCount: number;
  summary: AnalysisSummary;
  monthly: AnalysisMonthlyPoint[];
  /**
   * Lifestyle spend/refund peeks for leaderboard (i) popovers.
   * Keys: `section:…`, `category:…`, `subcategory:…`, `merchant:…`,
   * `tag:…`, `type:…`, `spread:…`, plus nested `subcategory-merchant:Sub::Merchant`, etc.
   */
  txnPeeks: AnalysisTxnPeekEntry[];
  sections: AnalysisRankedItem[];
  /** Rows keyed by series key for stacked section charts. */
  sectionMonthly: Array<Record<string, string | number>>;
  sectionSeries: AnalysisCategorySeries[];
  sectionOther: AnalysisRankedItem[];
  sectionOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  /** Section bars split by category. */
  sectionStacked: AnalysisStackedRankedBreakdown;
  /** Top vendors inside each section. */
  merchantsBySection: Record<string, AnalysisRankedItem[]>;
  /** Top categories inside each section. */
  categoriesBySection: Record<string, AnalysisRankedItem[]>;
  /** Top vendors inside each category. */
  merchantsByCategory: Record<string, AnalysisRankedItem[]>;
  /** Spread: Income + Needs / Wants / Savings */
  spreads: AnalysisRankedItem[];
  spreadMonthly: Array<Record<string, string | number>>;
  spreadSeries: AnalysisCategorySeries[];
  spreadOther: AnalysisRankedItem[];
  spreadOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  /** Spread bars split by category. */
  spreadStacked: AnalysisStackedRankedBreakdown;
  merchantsBySpread: Record<string, AnalysisRankedItem[]>;
  categoriesBySpread: Record<string, AnalysisRankedItem[]>;
  subcategories: AnalysisRankedItem[];
  /** Rows keyed by series key for stacked subcategory charts. */
  subcategoryMonthly: Array<Record<string, string | number>>;
  subcategorySeries: AnalysisCategorySeries[];
  subcategoryOther: AnalysisRankedItem[];
  subcategoryOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  /** Subcategory bars split by merchant_clean. */
  subcategoryStacked: AnalysisStackedRankedBreakdown;
  /** Per-subcategory merchant_clean drilldowns. */
  subcategoryBreakdowns: AnalysisSubcategoryBreakdown[];
  tags: AnalysisRankedItem[];
  tagMonthly: Array<Record<string, string | number>>;
  tagSeries: AnalysisCategorySeries[];
  tagOther: AnalysisRankedItem[];
  tagOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  /** Period → series key → categories inside that tag. */
  tagCategoryByPeriod: Record<string, Record<string, AnalysisRankedItem[]>>;
  /** Tag bars split by category. */
  tagStacked: AnalysisStackedRankedBreakdown;
  tagBreakdowns: AnalysisTagBreakdown[];
  /** Dimensional Type labels from transactions.kind (Fee, Subscription, …). */
  types: AnalysisRankedItem[];
  typeMonthly: Array<Record<string, string | number>>;
  typeSeries: AnalysisCategorySeries[];
  typeOther: AnalysisRankedItem[];
  typeOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  typeCategoryByPeriod: Record<string, Record<string, AnalysisRankedItem[]>>;
  typeStacked: AnalysisStackedRankedBreakdown;
  typeBreakdowns: AnalysisTypeBreakdown[];
  categories: AnalysisRankedItem[];
  /** Rows keyed by series key for stacked charts. */
  categoryMonthly: Array<Record<string, string | number>>;
  categorySeries: AnalysisCategorySeries[];
  categoryOther: AnalysisRankedItem[];
  categoryOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  /** Category bars split by subcategory. */
  categoryStacked: AnalysisStackedRankedBreakdown;
  breakdowns: AnalysisCategoryBreakdown[];
  merchants: AnalysisRankedItem[];
  merchantMonthly: Array<Record<string, string | number>>;
  merchantSeries: AnalysisCategorySeries[];
  merchantOther: AnalysisRankedItem[];
  merchantOtherByPeriod: Record<string, AnalysisRankedItem[]>;
  /** Merchant clean bars split by subcategory. */
  merchantStacked: AnalysisStackedRankedBreakdown;
  merchantBreakdowns: AnalysisMerchantBreakdown[];
  places: AnalysisRankedItem[];
  channels: AnalysisRankedItem[];
  weekdays: AnalysisRankedItem[];
  accounts: AnalysisRankedItem[];
  /** Weekday vs weekend lifestyle spend. */
  weekendSplit: AnalysisRankedItem[];
  /** Purchase size buckets (Under $15, $15-50, …). */
  ticketSizes: AnalysisRankedItem[];
  /** Calendar day-of-month (1-31) lifestyle spend. */
  dayOfMonth: AnalysisRankedItem[];
  /** High-frequency merchants sorted by swipe count. */
  habitMerchants: AnalysisRankedItem[];
  /** Country from Transaction Locations. */
  countries: AnalysisRankedItem[];
};

/** Flat row shape fed into computeAnalysis (joined account fields included). */
export type AnalysisSourceRow = {
  description: string | null;
  accountName: string | null;
  accountType: string | null;
  amount: number;
  currencyCode: string | null;
  postedDate: string;
  authorizedDate: string | null;
  transactionCode: string | null;
  paymentChannel: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  merchantClean: string | null;
  enrichmentChannel: string | null;
  sectionName: string | null;
  categoryName: string | null;
  /** Subcategory / spend-tree type label. */
  typeName: string | null;
  spreadName: string | null;
  companyName: string | null;
  brandName: string | null;
  tags: string | null;
  kind: string | null;
};
