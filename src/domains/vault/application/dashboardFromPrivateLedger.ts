import type { DashboardAccount, DashboardData, DashboardTransaction } from "@/domains/dashboard/domain/types";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

export function dashboardFromPrivateLedger(ledger: PrivateLedger): DashboardData {
  const accounts: DashboardAccount[] = ledger.accounts.map((account) => ({
    accountId: account.accountId,
    name: account.name,
    officialName: account.officialName ?? null,
    mask: account.mask ?? null,
    type: account.type ?? null,
    subtype: account.subtype ?? null,
    currentBalance: account.currentBalance ?? null,
    availableBalance: account.availableBalance ?? null,
    isoCurrencyCode: account.isoCurrencyCode ?? null,
    loanSummary: null,
  }));

  const accountIds = new Set(accounts.map((account) => account.accountId));
  for (const tx of ledger.transactions) {
    if (tx.accountId && !accountIds.has(tx.accountId)) {
      accountIds.add(tx.accountId);
      accounts.push({
        accountId: tx.accountId,
        name: tx.accountId,
        officialName: null,
        mask: null,
        type: null,
        subtype: null,
        currentBalance: null,
        availableBalance: null,
        isoCurrencyCode: tx.currency,
        loanSummary: null,
      });
    }
  }

  const transactions: DashboardTransaction[] = ledger.transactions.map((tx) => ({
    transactionId: tx.recordId,
    accountId: tx.accountId ?? "private",
    name: tx.description,
    merchantName: tx.merchantName ?? null,
    merchantClean: tx.merchantClean ?? null,
    companyName: null,
    brandName: null,
    sectionName: tx.sectionName ?? null,
    categoryName: tx.categoryName ?? null,
    spreadName: tx.spreadName ?? null,
    transactionTypeName: null,
    typeName: null,
    typeNames: [],
    subcategoryName: tx.subcategoryName ?? null,
    tagNames: tx.tagNames ?? [],
    enrichmentStatus: null,
    amount: tx.amount,
    isoCurrencyCode: tx.currency,
    date: tx.date,
    authorizedDate: null,
    pending: Boolean(tx.pending),
    paymentChannel: null,
    transactionCode: null,
    website: null,
    logoUrl: null,
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
    originalDescription: tx.description,
    source: "private-vault",
    bankDirection: null,
    historyMatch: null,
  }));

  const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
  const totalBalance = accounts.reduce((sum, account) => sum + (account.currentBalance ?? 0), 0);

  return {
    institutions: [{ institutionId: "private-vault", name: "Private vault" }],
    accounts,
    transactions,
    totalBalance,
    transactionCount: transactions.length,
    hasMoreTransactions: false,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    latestStatementDate: null,
  };
}
