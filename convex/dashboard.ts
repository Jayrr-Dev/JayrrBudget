import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUser, requireUser } from "./lib/auth";
import {
  collectPadCandidates,
  computeLoanAmortization,
  summaryFromAmortize,
  type LoanTermsRow,
} from "./lib/loanCompute";
import { splitTags } from "./lib/tags";

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
    vehicleLabel: row.vehicleLabel,
  };
}

export const get = query({
  args: {
    transactionLimit: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    try {
      const [institutionRows, accountRows, allTxns, statementRows, termsRows] =
        await Promise.all([
          ctx.db
            .query("institutions")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .collect(),
          ctx.db
            .query("accounts")
            .withIndex("by_userId", (q) => q.eq("userId", user._id))
            .collect(),
          ctx.db
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
        ]);

      const limit =
        typeof args.transactionLimit === "number" &&
        Number.isFinite(args.transactionLimit) &&
        args.transactionLimit > 0
          ? args.transactionLimit
          : null;

      const txnRows = limit ? allTxns.slice(0, limit) : allTxns;

      let loanSummariesByAccount = new Map<
        string,
        ReturnType<typeof summaryFromAmortize>
      >();

      if (termsRows.length > 0) {
        const termsList = termsRows.map(mapLoanTerms);
        const pads = collectPadCandidates(
          allTxns.map((t) => ({
            transactionId: t.transactionId,
            posted: t.posted,
            amount: t.amount,
            merchantClean: t.merchantClean,
            description: t.description,
          })),
          termsList[0]!.matchAmount,
        );
        loanSummariesByAccount = new Map(
          termsList.map((terms) => {
            const result = computeLoanAmortization(terms, pads);
            return [terms.accountId, summaryFromAmortize(terms, result)] as const;
          }),
        );
      }

      let earliestDate: string | null = null;
      let latestDate: string | null = null;
      for (const txn of allTxns) {
        if (!earliestDate || txn.posted < earliestDate) earliestDate = txn.posted;
        if (!latestDate || txn.posted > latestDate) latestDate = txn.posted;
      }

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
          const kindNames = txn.kind ? [txn.kind] : [];
          return {
            transactionId: txn.transactionId,
            accountId: txn.accountId,
            name: txn.description,
            merchantName: txn.merchantName,
            merchantClean: txn.merchantClean,
            companyName: txn.company,
            brandName: txn.brand,
            sectionName: txn.section,
            categoryName: txn.category,
            spreadName: txn.spread,
            transactionTypeName: txn.transactionType,
            typeName: txn.kind,
            typeNames: kindNames,
            subcategoryName: txn.subcategory,
            tagNames: [...new Set(splitTags(txn.tags))].sort((a, b) =>
              a.localeCompare(b),
            ),
            enrichmentStatus: txn.enrichment,
            amount: txn.amount,
            isoCurrencyCode: txn.currency,
            date: txn.posted,
            authorizedDate: txn.authorized,
            pending: Boolean(txn.pending),
            categoryPrimary: txn.categoryPrimary,
            categoryDetailed: txn.categoryDetailed,
            categoryConfidence: txn.categoryConfidence,
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
        transactionCount: allTxns.length,
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

export const refreshLoans = mutation({
  args: {
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ensureUser(ctx);
    const termsRows = await ctx.db
      .query("loanTerms")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (termsRows.length === 0) return [];

    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const termsList = termsRows.map(mapLoanTerms);
    const pads = collectPadCandidates(
      allTxns.map((t) => ({
        transactionId: t.transactionId,
        posted: t.posted,
        amount: t.amount,
        merchantClean: t.merchantClean,
        description: t.description,
      })),
      termsList[0]!.matchAmount,
    );

    const asOfDate = args.asOfDate ?? new Date().toISOString().slice(0, 10);
    const out: {
      accountId: string;
      balance: number;
      paymentsApplied: number;
      linkedPads: number;
    }[] = [];

    for (const terms of termsList) {
      const result = computeLoanAmortization(terms, pads, asOfDate);
      const account = await ctx.db
        .query("accounts")
        .withIndex("by_userId_accountId", (q) =>
          q.eq("userId", user._id).eq("accountId", terms.accountId),
        )
        .unique();
      if (account) {
        if (account.userId !== user._id) {
          throw new Error("Account does not belong to current user");
        }
        await ctx.db.patch(account._id, {
          currentBalance: result.currentBalance,
          availableBalance: result.currentBalance,
          updatedAt: Date.now(),
        });
      }

      const existingLinks = await ctx.db
        .query("loanPaymentLinks")
        .withIndex("by_userId_loanAccountId", (q) =>
          q.eq("userId", user._id).eq("loanAccountId", terms.accountId),
        )
        .collect();
      for (const link of existingLinks) {
        await ctx.db.delete(link._id);
      }

      for (const step of result.schedule) {
        if (!step.applied) continue;
        await ctx.db.insert("loanPaymentLinks", {
          userId: user._id,
          loanAccountId: terms.accountId,
          paymentNumber: step.paymentNumber,
          scheduledDate: step.scheduledDate,
          postedDate: step.postedDate,
          transactionId: step.transactionId,
          paymentAmount: step.paymentAmount,
          interestPortion: step.interestPortion,
          principalPortion: step.principalPortion,
          balanceAfter: step.balanceAfter,
        });
      }

      out.push({
        accountId: terms.accountId,
        balance: result.currentBalance,
        paymentsApplied: result.paymentsApplied,
        linkedPads: result.schedule.filter(
          (s) => s.applied && s.transactionId,
        ).length,
      });
    }

    return out;
  },
});
