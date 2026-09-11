export type AnalysisRange = "1w" | "1m" | "3m" | "6m" | "12m" | "all";

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
};

export type AnalysisSummary = {
  /** Lifestyle / real outflow only — internal transfers excluded. */
  totalSpend: number;
  /** Real inflows only — card payments / internal credits excluded. */
  totalIncome: number;
  net: number;
  avgMonthlySpend: number;
  peakSpendMonth: string | null;
  peakSpendAmount: number;
  /** Paying-side internal moves only (chequing → card). Matching visa credits excluded. */
  internalTransfers: number;
  transferCount: number;
  spendCount: number;
  refunds: number;
  inboundTransfersIgnored: number;
};

export type AnalysisCategorySeries = {
  key: string;
  label: string;
};

export type AnalysisCategoryBreakdown = {
  category: string;
  spend: number;
  types: AnalysisRankedItem[];
  merchants: AnalysisRankedItem[];
  typeSeries: AnalysisCategorySeries[];
  typeMonthly: Array<Record<string, string | number>>;
};

export type AnalysisData = {
  currency: string;
  range: AnalysisRange;
  earliestDate: string | null;
  latestDate: string | null;
  transactionCount: number;
  summary: AnalysisSummary;
  monthly: AnalysisMonthlyPoint[];
  categories: AnalysisRankedItem[];
  /** Rows keyed by series key for stacked charts. */
  categoryMonthly: Array<Record<string, string | number>>;
  categorySeries: AnalysisCategorySeries[];
  breakdowns: AnalysisCategoryBreakdown[];
  merchants: AnalysisRankedItem[];
  places: AnalysisRankedItem[];
  channels: AnalysisRankedItem[];
  weekdays: AnalysisRankedItem[];
  accounts: AnalysisRankedItem[];
};
