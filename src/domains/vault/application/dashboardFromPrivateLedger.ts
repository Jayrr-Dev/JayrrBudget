import { resolveAccountCategory } from "@/domains/dashboard/domain/accountCategory";
import type {
  DashboardAccount,
  DashboardData,
  DashboardLoanSummary,
  DashboardTransaction,
} from "@/domains/dashboard/domain/types";
import { toMatchedPads } from "@/domains/loans/application/matchLoanPayments";
import {
  amortizeLoan,
  buildScheduledDates,
  matchPadsToSchedule,
} from "@/domains/loans/domain/amortize";
import {
  loanTypeMeta,
  normalizeLoanType,
  normalizeRateType,
} from "@/domains/loans/domain/loanTypes";
import { normalizePaymentFrequency } from "@/domains/loans/domain/paymentFrequency";
import type {
  PrivateAccount,
  PrivateLedger,
  PrivateLoanTerms,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";
import { rewriteTaxonomyLabel } from "@convex/lib/seedCategoryPaths";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loanSummaryFor(
  loan: PrivateLoanTerms,
  txs: PrivateTransaction[],
): DashboardLoanSummary {
  const frequency = normalizePaymentFrequency(
    loan.paymentFrequency ?? "biweekly",
  );
  const loanType = normalizeLoanType(loan.loanType);
  const rateType = normalizeRateType(loan.rateType);
  const matchAmount = loan.matchAmount ?? loan.paymentAmount;
  const matchMerchantClean = loan.matchMerchantClean?.trim() || "";
  const pads = toMatchedPads(
    txs.map((tx) => ({
      transactionId: tx.recordId,
      posted: tx.date,
      amount: tx.amount,
      merchantClean: tx.merchantClean ?? null,
      description: tx.description,
    })),
    matchAmount,
    matchMerchantClean,
  );
  const scheduledDates = buildScheduledDates(
    loan.firstPaymentDate,
    loan.paymentCount,
    frequency,
  );
  const result = amortizeLoan(
    {
      principalStart: loan.principal,
      annualRate: loan.annualRate,
      paymentAmount: loan.paymentAmount,
      paymentCount: loan.paymentCount,
      firstPaymentDate: loan.firstPaymentDate,
      paymentFrequency: frequency,
    },
    todayIso(),
    matchPadsToSchedule(scheduledDates, pads, matchAmount),
  );
  const maturityDate =
    scheduledDates[scheduledDates.length - 1] ?? loan.firstPaymentDate;

  return {
    remainingPrincipal: result.currentBalance,
    nextPaymentDate: result.nextPaymentDate,
    progressPct: result.progressPct,
    annualRate: loan.annualRate,
    aprDisclosed: null,
    paymentAmount: loan.paymentAmount,
    paymentCount: loan.paymentCount,
    paymentsApplied: result.paymentsApplied,
    remainingPayments: result.remainingPayments,
    firstPaymentDate: loan.firstPaymentDate,
    maturityDate,
    loanType,
    rateType,
    vehicleLabel: loan.vehicleLabel ?? null,
    paidInterest: result.paidInterest,
    paidPrincipal: result.paidPrincipal,
    matchMerchantClean,
    payments: result.schedule.filter((step) => step.applied),
  };
}

function toDashboardAccount(
  account: Pick<
    PrivateAccount,
    | "accountId"
    | "name"
    | "label"
    | "officialName"
    | "mask"
    | "type"
    | "subtype"
    | "currentBalance"
    | "availableBalance"
    | "isoCurrencyCode"
  >,
  loan: PrivateLoanTerms | undefined,
  txs: PrivateTransaction[],
): DashboardAccount {
  const loanSummary = loan ? loanSummaryFor(loan, txs) : null;
  const currentBalance = loanSummary
    ? loanSummary.remainingPrincipal
    : (account.currentBalance ?? null);
  return {
    accountId: account.accountId,
    name: account.name,
    label: account.label ?? null,
    officialName: account.officialName ?? null,
    mask: account.mask ?? null,
    type: account.type ?? null,
    subtype: account.subtype ?? null,
    currentBalance,
    availableBalance: loanSummary
      ? loanSummary.remainingPrincipal
      : (account.availableBalance ?? null),
    isoCurrencyCode: account.isoCurrencyCode ?? null,
    loanSummary,
  };
}

export function dashboardFromPrivateLedger(
  ledger: PrivateLedger,
): DashboardData {
  const usedAccountIds = new Set(
    ledger.transactions
      .map((tx) => tx.accountId)
      .filter((id): id is string => Boolean(id)),
  );
  const loansByAccount = new Map(
    ledger.loans.map((loan) => [loan.accountId, loan]),
  );

  const visibleAccounts = ledger.accounts.filter(
    (account) =>
      usedAccountIds.has(account.accountId) ||
      loansByAccount.has(account.accountId) ||
      resolveAccountCategory(account) === "lending",
  );
  const accounts: DashboardAccount[] = visibleAccounts.map((account) =>
    toDashboardAccount(
      account,
      loansByAccount.get(account.accountId),
      ledger.transactions,
    ),
  );

  const accountIds = new Set(accounts.map((account) => account.accountId));
  for (const tx of ledger.transactions) {
    if (tx.accountId && !accountIds.has(tx.accountId)) {
      accountIds.add(tx.accountId);
      accounts.push(
        toDashboardAccount(
          {
            accountId: tx.accountId,
            name: tx.accountId,
            label: null,
            officialName: null,
            mask: null,
            type: null,
            subtype: null,
            currentBalance: null,
            availableBalance: null,
            isoCurrencyCode: tx.currency,
          },
          loansByAccount.get(tx.accountId),
          ledger.transactions,
        ),
      );
    }
  }

  for (const loan of ledger.loans) {
    if (accountIds.has(loan.accountId)) continue;
    accountIds.add(loan.accountId);
    const typeMeta = loanTypeMeta(normalizeLoanType(loan.loanType));
    accounts.push(
      toDashboardAccount(
        {
          accountId: loan.accountId,
          name: loan.matchMerchantClean?.trim() || "Loan",
          label: null,
          officialName: null,
          mask: null,
          type: typeMeta.value === "mortgage" ? "mortgage" : "loan",
          subtype: typeMeta.subtype,
          currentBalance: loan.principal,
          availableBalance: loan.principal,
          isoCurrencyCode: "CAD",
        },
        loan,
        ledger.transactions,
      ),
    );
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
      categoryName: rewriteTaxonomyLabel("category", tx.categoryName),
      spreadName: tx.spreadName ?? null,
      transactionTypeName: tx.transactionTypeName ?? null,
      typeName: rewriteTaxonomyLabel("subcategory", tx.subcategoryName),
      typeNames: [],
      subcategoryName: rewriteTaxonomyLabel("subcategory", tx.subcategoryName),
      tagNames: tx.tagNames ?? [],
      enrichmentStatus: null,
      amount: tx.amount,
      isoCurrencyCode: tx.currency,
      foreignCurrency: tx.foreignCurrency ?? null,
      foreignAmount: tx.foreignAmount ?? null,
      exchangeRate: tx.exchangeRate ?? null,
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

  const dates = transactions
    .map((tx) => tx.date)
    .filter(Boolean)
    .sort();
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (account.currentBalance ?? 0),
    0,
  );
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
    latestStatementDate:
      latestLog?.statementPeriodEnd ?? dates[dates.length - 1] ?? null,
  };
}
