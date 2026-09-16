import type { DashboardAccount, DashboardData, DashboardTransaction } from "@/domains/dashboard/domain/types";
import type { PrivateLedger } from "@/domains/vault/domain/privateLedger";

export function dashboardFromPrivateLedger(ledger: PrivateLedger): DashboardData {
  const usedAccountIds = new Set(
    ledger.transactions
      .map((tx) => tx.accountId)
      .filter((id): id is string => Boolean(id)),
  );
  const visibleAccounts = ledger.accounts.filter((account) =>
    usedAccountIds.has(account.accountId),
  );
  const accounts: DashboardAccount[] = visibleAccounts.map((account) => ({
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

  const logoByName = new Map<string, string>();
  for (const merchant of ledger.merchants) {
    if (!merchant.logoUrl) continue;
    logoByName.set(merchant.name, merchant.logoUrl);
  }

  const transactions: DashboardTransaction[] = ledger.transactions.map((tx) => {
    const merchantLabel = tx.merchantClean ?? tx.merchantName ?? "";
    return {
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
      transactionTypeName: tx.transactionTypeName ?? null,
      typeName: tx.subcategoryName ?? null,
      typeNames: [],
      subcategoryName: tx.subcategoryName ?? null,
      tagNames: tx.tagNames ?? [],
      enrichmentStatus: null,
      amount: tx.amount,
      isoCurrencyCode: tx.currency,
      date: tx.date,
      authorizedDate: tx.authorizedDate ?? null,
      pending: Boolean(tx.pending),
      paymentChannel: tx.channel ?? null,
      transactionCode: tx.txnCode ?? null,
      website: null,
      logoUrl: logoByName.get(merchantLabel) ?? null,
      locationCity: tx.city ?? null,
      locationRegion: tx.region ?? null,
      locationCountry: tx.country ?? null,
      originalDescription: tx.description,
      source: tx.source ?? "statement",
      bankDirection: null,
      historyMatch: null,
    };
  });

  const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
  const totalBalance = accounts.reduce((sum, account) => sum + (account.currentBalance ?? 0), 0);
  const latestLog = ledger.statementLogs
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    institutions:
      accounts.length || transactions.length
        ? [{ institutionId: "accounts", name: "Accounts" }]
        : [],
    accounts,
    transactions,
    totalBalance,
    transactionCount: transactions.length,
    hasMoreTransactions: false,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    latestStatementDate: latestLog?.statementPeriodEnd ?? dates[dates.length - 1] ?? null,
  };
}
