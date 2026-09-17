import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  collectPadCandidates,
  computeLoanAmortization,
  summaryFromAmortize,
  type LoanTermsRow,
} from "./lib/loanCompute";
import { normalizeLoanType, normalizeRateType } from "./lib/loanTypes";
import { rewriteTaxonomyLabel } from "./lib/seedCategoryPaths";
import { splitTags } from "./lib/tags";

const paymentFrequencyValidator = v.union(
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("semimonthly"),
  v.literal("monthly"),
);

const loanTypeArgValidator = v.union(
  v.literal("auto"),
  v.literal("mortgage"),
  v.literal("student"),
  v.literal("personal"),
  v.literal("heloc"),
  v.literal("other"),
);

const rateTypeArgValidator = v.union(v.literal("fixed"), v.literal("variable"));

function mapLoanTerms(row: {
  accountId: string;
  principalStart: number;
  annualRate: number;
  aprDisclosed: number | null;
  paymentAmount: number;
  paymentFrequency: string;
  paymentCount: number;
  firstPaymentDate: string;
  maturityDate: string;
  matchMerchantClean: string;
  matchAmount: number;
  principalOverride: number | null;
  overrideAsOf: string | null;
  loanType?: string;
  rateType?: string;
  vehicleLabel: string | null;
}): LoanTermsRow {
  return {
    accountId: row.accountId,
    principalStart: row.principalStart,
    annualRate: row.annualRate,
    aprDisclosed: row.aprDisclosed,
    paymentAmount: row.paymentAmount,
    paymentFrequency: row.paymentFrequency,
    paymentCount: row.paymentCount,
    firstPaymentDate: row.firstPaymentDate,
    maturityDate: row.maturityDate,
    matchMerchantClean: row.matchMerchantClean,
    matchAmount: row.matchAmount,
    principalOverride: row.principalOverride,
    overrideAsOf: row.overrideAsOf,
    loanType: normalizeLoanType(row.loanType),
    rateType: normalizeRateType(row.rateType),
    vehicleLabel: row.vehicleLabel,
  };
}

function txnPadRows(
  allTxns: Array<{
    transactionId: string;
    posted: string;
    amount: number;
    merchantClean: string | null;
    description: string;
  }>,
) {
  return allTxns.map((t) => ({
    transactionId: t.transactionId,
    posted: t.posted,
    amount: t.amount,
    merchantClean: t.merchantClean,
    description: t.description,
  }));
}

export const get = query({
  args: {
    transactionLimit: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    try {
      const limit =
        typeof args.transactionLimit === "number" &&
        Number.isFinite(args.transactionLimit) &&
        args.transactionLimit > 0
          ? args.transactionLimit
          : null;

      const [
        institutionRows,
        accountRows,
        txnRows,
        statementRows,
        termsRows,
        latestTxn,
        earliestTxn,
      ] = await Promise.all([
        ctx.db
          .query("institutions")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect(),
        ctx.db
          .query("accounts")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect(),
        limit
          ? ctx.db
              .query("transactions")
              .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
              .order("desc")
              .take(limit)
          : ctx.db
              .query("transactions")
              .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
              .order("desc")
              .collect(),
        ctx.db
          .query("statementUploads")
          .withIndex("by_userId_status", (q) =>
            q.eq("userId", user._id).eq("status", "completed"),
          )
          .collect(),
        ctx.db
          .query("loanTerms")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect(),
        ctx.db
          .query("transactions")
          .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
          .order("desc")
          .first(),
        ctx.db
          .query("transactions")
          .withIndex("by_userId_posted", (q) => q.eq("userId", user._id))
          .order("asc")
          .first(),
      ]);

      let padSource = txnPadRows(txnRows);
      if (termsRows.length > 0) {
        const loanAccountIds = [
          ...new Set(termsRows.map((row) => row.accountId)),
        ];
        const loanTxnGroups = await Promise.all(
          loanAccountIds.map((accountId) =>
            ctx.db
              .query("transactions")
              .withIndex("by_userId_accountId_posted", (q) =>
                q.eq("userId", user._id).eq("accountId", accountId),
              )
              .collect(),
          ),
        );
        padSource = txnPadRows(loanTxnGroups.flat());
      }

      let loanSummariesByAccount = new Map<
        string,
        ReturnType<typeof summaryFromAmortize>
      >();

      if (termsRows.length > 0) {
        const termsList = termsRows.map(mapLoanTerms);
        loanSummariesByAccount = new Map(
          termsList.map((terms) => {
            const pads = collectPadCandidates(padSource, terms.matchAmount);
            const result = computeLoanAmortization(terms, pads);
            return [
              terms.accountId,
              summaryFromAmortize(terms, result),
            ] as const;
          }),
        );
      }

      const earliestDate = earliestTxn?.posted ?? null;
      const latestDate = latestTxn?.posted ?? null;

      let latestStatementDate: string | null = null;
      for (const s of statementRows) {
        if (
          s.statementPeriodEnd &&
          (!latestStatementDate || s.statementPeriodEnd > latestStatementDate)
        ) {
          latestStatementDate = s.statementPeriodEnd;
        }
      }

      const data = {
        institutions: institutionRows.map((row) => ({
          institutionId: row.institutionId,
          name: row.name,
        })),
        accounts: accountRows.map((account) => {
          const loanSummary =
            loanSummariesByAccount.get(account.accountId) ?? null;
          return {
            accountId: account.accountId,
            name: account.name,
            officialName: account.officialName,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance:
              loanSummary?.remainingPrincipal ?? account.currentBalance,
            availableBalance:
              loanSummary?.remainingPrincipal ?? account.availableBalance,
            isoCurrencyCode: account.isoCurrencyCode,
            loanSummary,
          };
        }),
        transactions: txnRows.map((txn) => {
          return {
            transactionId: txn.transactionId,
            accountId: txn.accountId,
            name: txn.description,
            merchantName: txn.merchantName,
            merchantClean: txn.merchantClean,
            companyName: txn.company,
            brandName: txn.brand,
            sectionName: txn.section,
            categoryName: rewriteTaxonomyLabel("category", txn.category),
            spreadName: txn.spread,
            transactionTypeName: txn.transactionType,
            typeName: null,
            typeNames: [],
            subcategoryName: rewriteTaxonomyLabel(
              "subcategory",
              txn.subcategory,
            ),
            tagNames: [...new Set(splitTags(txn.tags))].sort((a, b) =>
              a.localeCompare(b),
            ),
            enrichmentStatus: txn.enrichment,
            amount: txn.amount,
            isoCurrencyCode: txn.currency,
            foreignCurrency: txn.foreignCurrency ?? null,
            foreignAmount: txn.foreignAmount ?? null,
            exchangeRate: txn.exchangeRate ?? null,
            date: txn.posted,
            authorizedDate: txn.authorized,
            pending: Boolean(txn.pending),
            paymentChannel: txn.channel,
            transactionCode: txn.txnCode,
            website: txn.website,
            logoUrl: txn.logoUrl,
            locationCity: txn.city,
            locationRegion: txn.region,
            locationCountry: txn.country,
            originalDescription: txn.originalDescription,
            source: txn.source,
            bankDirection: txn.bankDirection,
            historyMatch: txn.crossCheck,
          };
        }),
        totalBalance: accountRows.reduce((sum, account) => {
          const loan = loanSummariesByAccount.get(account.accountId);
          return (
            sum + (loan?.remainingPrincipal ?? account.currentBalance ?? 0)
          );
        }, 0),
        transactionCount: txnRows.length,
        hasMoreTransactions: Boolean(limit && txnRows.length === limit),
        earliestDate,
        latestDate,
        latestStatementDate,
      };

      return { ok: true as const, data };
    } catch (error) {
      return {
        ok: false as const,
        status: 500,
        error:
          error instanceof Error
            ? error.message
            : "Convex dashboard query failed",
      };
    }
  },
});

export const createCustomLoan = mutation({
  args: {
    name: v.string(),
    loanType: v.optional(loanTypeArgValidator),
    rateType: v.optional(rateTypeArgValidator),
    vehicleLabel: v.optional(v.union(v.string(), v.null())),
    principalStart: v.number(),
    annualRate: v.number(),
    paymentAmount: v.number(),
    paymentFrequency: paymentFrequencyValidator,
    paymentCount: v.number(),
    firstPaymentDate: v.string(),
    matchMerchantClean: v.optional(v.union(v.string(), v.null())),
  },
  handler: async () => {
    throw new Error(
      "createCustomLoan is retired. Register lending accounts in the private ledger (vault).",
    );
  },
});

export const refreshLoans = mutation({
  args: {
    asOfDate: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error(
      "refreshLoans is retired. Private ledger amortizes loans in the browser.",
    );
  },
});
