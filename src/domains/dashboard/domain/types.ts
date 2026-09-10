export type DashboardAccount = {
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isoCurrencyCode: string | null;
};

export type DashboardTransaction = {
  plaidTransactionId: string;
  accountId: string;
  name: string;
  merchantName: string | null;
  merchantClean: string | null;
  companyName: string | null;
  brandName: string | null;
  sectionName: string | null;
  categoryName: string | null;
  typeName: string | null;
  tagNames: string[];
  enrichmentStatus: string | null;
  amount: number;
  isoCurrencyCode: string | null;
  date: string;
  authorizedDate: string | null;
  pending: boolean;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  categoryConfidence: string | null;
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
  itemId: string;
  institutionName: string | null;
  daysRequested: number;
};

export type DashboardData = {
  institutions: DashboardInstitution[];
  accounts: DashboardAccount[];
  transactions: DashboardTransaction[];
  totalBalance: number;
  transactionCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  daysRequested: number;
};
