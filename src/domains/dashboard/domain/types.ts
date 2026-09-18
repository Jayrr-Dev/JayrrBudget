export type DashboardAccount = {
  accountId: string;
  name: string;
  /** Nickname shown in the UI. Does not replace name or accountId. */
  label: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isoCurrencyCode: string | null;
  /** Present when account has loan_terms (synthetic amortizing loan). */
  loanSummary?: DashboardLoanSummary | null;
};

export type DashboardLoanPayment = {
  paymentNumber: number;
  scheduledDate: string;
  postedDate: string | null;
  transactionId: string | null;
  paymentAmount: number;
  interestPortion: number;
  principalPortion: number;
  balanceAfter: number;
  assumed: boolean;
};

export type DashboardLoanSummary = {
  remainingPrincipal: number;
  nextPaymentDate: string | null;
  progressPct: number;
  annualRate: number;
  aprDisclosed: number | null;
  paymentAmount: number;
  paymentCount: number;
  paymentsApplied: number;
  remainingPayments: number;
  firstPaymentDate: string;
  maturityDate: string;
  loanType: string;
  rateType: string;
  vehicleLabel: string | null;
  paidInterest: number;
  paidPrincipal: number;
  matchMerchantClean: string;
  payments: DashboardLoanPayment[];
};

export type DashboardTransaction = {
  transactionId: string;
  accountId: string;
  name: string;
  merchantName: string | null;
  merchantClean: string | null;
  companyName: string | null;
  brandName: string | null;
  sectionName: string | null;
  categoryName: string | null;
  /** 50/30/20: Needs / Wants / Savings */
  spreadName: string | null;
  transactionTypeName: string | null;
  typeName: string | null;
  typeNames: string[];
  subcategoryName: string | null;
  tagNames: string[];
  enrichmentStatus: string | null;
  amount: number;
  isoCurrencyCode: string | null;
  /** Original purchase currency when the line is FX. */
  foreignCurrency: string | null;
  /** Original amount in foreignCurrency when printed. */
  foreignAmount: number | null;
  /** Statement FX rate when printed. */
  exchangeRate: number | null;
  date: string;
  authorizedDate: string | null;
  pending: boolean;
  paymentChannel: string | null;
  transactionCode: string | null;
  website: string | null;
  logoUrl: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  originalDescription: string | null;
  source: string | null;
  bankDirection: string | null;
  historyMatch: string | null;
};

export type DashboardInstitution = {
  institutionId: string;
  name: string | null;
};

export type DashboardData = {
  institutions: DashboardInstitution[];
  accounts: DashboardAccount[];
  transactions: DashboardTransaction[];
  totalBalance: number;
  transactionCount: number;
  hasMoreTransactions?: boolean;
  earliestDate: string | null;
  latestDate: string | null;
  latestStatementDate: string | null;
};
