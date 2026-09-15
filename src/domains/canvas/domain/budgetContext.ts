import type { DashboardData } from "@/domains/dashboard/domain/types";

/** Compact ledger snapshot for canvas AI. Same shape whether built server-side or from decrypted vault. */
export function buildBudgetContextFromDashboard(data: DashboardData) {
  const spend = data.transactions.filter((txn) => txn.amount > 0);
  const income = data.transactions.filter((txn) => txn.amount < 0);
  const spendTotal = spend.reduce((sum, txn) => sum + txn.amount, 0);
  const incomeTotal = income.reduce((sum, txn) => sum + Math.abs(txn.amount), 0);

  const byMerchant = new Map<string, number>();
  for (const txn of spend) {
    const key = txn.merchantClean ?? txn.merchantName ?? txn.name ?? "Unknown";
    byMerchant.set(key, (byMerchant.get(key) ?? 0) + txn.amount);
  }

  const topMerchants = [...byMerchant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }));

  return {
    accounts: data.accounts.map((account) => ({
      name: account.name,
      mask: account.mask,
      type: account.type,
      balance: account.currentBalance,
      currency: account.isoCurrencyCode,
    })),
    totals: {
      balance: data.totalBalance,
      transactionCount: data.transactionCount,
      spendTotal: Number(spendTotal.toFixed(2)),
      incomeTotal: Number(incomeTotal.toFixed(2)),
      earliestDate: data.earliestDate,
      latestDate: data.latestDate,
    },
    topMerchants,
    recentTransactions: data.transactions.slice(0, 25).map((txn) => ({
      date: txn.date,
      merchant: txn.merchantClean ?? txn.merchantName ?? txn.name,
      amount: txn.amount,
      category:
        txn.subcategoryName ||
        txn.typeName ||
        txn.categoryName ||
        txn.sectionName,
    })),
    source: "dashboard" as const,
  };
}

export type CanvasBudgetContext = ReturnType<typeof buildBudgetContextFromDashboard> | { error: string };
