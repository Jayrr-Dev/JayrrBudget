import { classifyCashFlow, type CashFlowKind } from "@/domains/analysis/domain/cashFlow";
import { displayAccountName } from "@/domains/dashboard/domain/accountName";
import type {
  DashboardData,
  DashboardLoanSummary,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";

/** Loan facts Piggy can quote without the full payment schedule. */
function compactLoan(loan: DashboardLoanSummary | null | undefined) {
  if (!loan) return null;
  return {
    type: loan.loanType,
    rateType: loan.rateType,
    annualRate: loan.annualRate,
    apr: loan.aprDisclosed,
    paymentAmount: loan.paymentAmount,
    remainingPrincipal: loan.remainingPrincipal,
    paidInterest: loan.paidInterest,
    paidPrincipal: loan.paidPrincipal,
    progressPct: loan.progressPct,
    paymentsApplied: loan.paymentsApplied,
    remainingPayments: loan.remainingPayments,
    nextPaymentDate: loan.nextPaymentDate,
    maturityDate: loan.maturityDate,
    collateral: loan.vehicleLabel,
  };
}

function cashFlowKind(txn: DashboardTransaction, accountType: string | null): CashFlowKind {
  return classifyCashFlow({
    amountMinor: Math.round(txn.amount * 100),
    description: txn.name,
    accountType,
    sectionName: txn.sectionName,
    categoryName: txn.categoryName,
    typeName: txn.typeName,
    transactionCode: txn.transactionCode,
  });
}

/** Compact ledger snapshot for canvas AI. Same shape whether built server-side or from decrypted vault. */
export function buildBudgetContextFromDashboard(data: DashboardData) {
  const accountTypeById = new Map(data.accounts.map((a) => [a.accountId, a.type]));
  const classified = data.transactions.map((txn) => ({
    txn,
    kind: cashFlowKind(txn, accountTypeById.get(txn.accountId) ?? null),
  }));

  // Transfers between own accounts and card payoffs are not spend or income.
  const spend = classified.filter((row) => row.kind === "spend").map((row) => row.txn);
  const income = classified.filter((row) => row.kind === "income").map((row) => row.txn);
  const transferTotal = classified
    .filter((row) => row.kind === "transfer_out")
    .reduce((sum, row) => sum + row.txn.amount, 0);
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

  // Spend / income per account so "what did I put on my Visa" has an answer.
  const byAccount = new Map<string, { spend: number; income: number; count: number }>();
  for (const { txn, kind } of classified) {
    if (kind !== "spend" && kind !== "income") continue;
    const bucket = byAccount.get(txn.accountId) ?? { spend: 0, income: 0, count: 0 };
    bucket.count += 1;
    if (kind === "spend") bucket.spend += txn.amount;
    else bucket.income += Math.abs(txn.amount);
    byAccount.set(txn.accountId, bucket);
  }

  return {
    accounts: data.accounts.map((account) => {
      const activity = byAccount.get(account.accountId);
      return {
        accountId: account.accountId,
        name: displayAccountName(account),
        officialName: account.officialName,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        balance: account.currentBalance,
        available: account.availableBalance,
        currency: account.isoCurrencyCode,
        /** Over the loaded window (see totals.earliestDate / latestDate). */
        spend: Number((activity?.spend ?? 0).toFixed(2)),
        income: Number((activity?.income ?? 0).toFixed(2)),
        transactionCount: activity?.count ?? 0,
        loan: compactLoan(account.loanSummary),
      };
    }),
    totals: {
      balance: data.totalBalance,
      transactionCount: data.transactionCount,
      spendTotal: Number(spendTotal.toFixed(2)),
      incomeTotal: Number(incomeTotal.toFixed(2)),
      /** Money moved between own accounts / card payoffs. Not spend. */
      transferTotal: Number(transferTotal.toFixed(2)),
      earliestDate: data.earliestDate,
      latestDate: data.latestDate,
    },
    topMerchants,
    recentTransactions: classified.slice(0, 25).map(({ txn, kind }) => ({
      date: txn.date,
      accountId: txn.accountId,
      merchant: txn.merchantClean ?? txn.merchantName ?? txn.name,
      amount: txn.amount,
      kind,
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
