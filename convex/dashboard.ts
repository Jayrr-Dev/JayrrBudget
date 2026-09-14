import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUser, requireUser } from "./lib/auth";
import { buildScheduledDates } from "./lib/amortize";
import {
  collectPadCandidates,
  computeLoanAmortization,
  summaryFromAmortize,
  type LoanTermsRow,
} from "./lib/loanCompute";
import {
  normalizePaymentFrequency,
} from "./lib/paymentFrequency";
import { splitTags } from "./lib/tags";

const MANUAL_INSTITUTION_ID = "manual";

const paymentFrequencyValidator = v.union(
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("semimonthly"),
  v.literal("monthly"),
);

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

function slugifyAccountId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "loan";
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
      const padSource = txnPadRows(allTxns);

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

export const createCustomLoan = mutation({
  args: {
    name: v.string(),
    vehicleLabel: v.optional(v.union(v.string(), v.null())),
    principalStart: v.number(),
    annualRate: v.number(),
    paymentAmount: v.number(),
    paymentFrequency: paymentFrequencyValidator,
    paymentCount: v.number(),
    firstPaymentDate: v.string(),
    matchMerchantClean: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await ensureUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Name is required");

    if (
      !Number.isFinite(args.principalStart) ||
      args.principalStart <= 0 ||
      !Number.isFinite(args.annualRate) ||
      args.annualRate < 0 ||
      !Number.isFinite(args.paymentAmount) ||
      args.paymentAmount <= 0 ||
      !Number.isFinite(args.paymentCount) ||
      args.paymentCount < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(args.firstPaymentDate)
    ) {
      throw new Error("Invalid loan terms");
    }

    const frequency = normalizePaymentFrequency(args.paymentFrequency);
    const vehicleLabel = args.vehicleLabel?.trim() || null;
    const matchMerchantClean = args.matchMerchantClean?.trim() || name;
    const matchAmount = args.paymentAmount;

    const scheduled = buildScheduledDates(
      args.firstPaymentDate,
      Math.floor(args.paymentCount),
      frequency,
    );
    const maturityDate =
      scheduled[scheduled.length - 1] ?? args.firstPaymentDate;

    let accountId = slugifyAccountId(name);
    for (let n = 2; ; n += 1) {
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_userId_accountId", (q) =>
          q.eq("userId", user._id).eq("accountId", accountId),
        )
        .unique();
      if (!existing) break;
      accountId = `${slugifyAccountId(name)}-${n}`;
    }

    const now = Date.now();
    const manualInstitution = await ctx.db
      .query("institutions")
      .withIndex("by_userId_institutionId", (q) =>
        q.eq("userId", user._id).eq("institutionId", MANUAL_INSTITUTION_ID),
      )
      .unique();
    if (!manualInstitution) {
      await ctx.db.insert("institutions", {
        userId: user._id,
        institutionId: MANUAL_INSTITUTION_ID,
        name: "Manual",
        createdAt: now,
        updatedAt: now,
      });
    }

    const terms: LoanTermsRow = {
      accountId,
      principalStart: args.principalStart,
      annualRate: args.annualRate,
      aprDisclosed: null,
      paymentAmount: args.paymentAmount,
      paymentFrequency: frequency,
      paymentCount: Math.floor(args.paymentCount),
      firstPaymentDate: args.firstPaymentDate,
      maturityDate,
      matchMerchantClean,
      matchAmount,
      principalOverride: null,
      overrideAsOf: null,
      vehicleLabel,
    };

    const allTxns = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const pads = collectPadCandidates(txnPadRows(allTxns), matchAmount);
    const amortize = computeLoanAmortization(terms, pads);

    await ctx.db.insert("accounts", {
      userId: user._id,
      accountId,
      institutionId: MANUAL_INSTITUTION_ID,
      name,
      officialName: vehicleLabel ? `${vehicleLabel} — Personal Loan` : name,
      mask: null,
      type: "loan",
      subtype: "auto loan",
      currentBalance: amortize.currentBalance,
      availableBalance: amortize.currentBalance,
      isoCurrencyCode: "CAD",
      updatedAt: now,
    });

    await ctx.db.insert("loanTerms", {
      userId: user._id,
      accountId,
      principalStart: terms.principalStart,
      annualRate: terms.annualRate,
      aprDisclosed: null,
      paymentAmount: terms.paymentAmount,
      paymentFrequency: terms.paymentFrequency,
      paymentCount: terms.paymentCount,
      firstPaymentDate: terms.firstPaymentDate,
      maturityDate: terms.maturityDate,
      matchMerchantClean: terms.matchMerchantClean,
      matchAmount: terms.matchAmount,
      principalOverride: null,
      overrideAsOf: null,
      vehicleLabel,
      updatedAt: now,
    });

    return { accountId };
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
    const padSource = txnPadRows(allTxns);

    const asOfDate = args.asOfDate ?? new Date().toISOString().slice(0, 10);
    const out: {
      accountId: string;
      balance: number;
      paymentsApplied: number;
      linkedPads: number;
    }[] = [];

    for (const terms of termsList) {
      const pads = collectPadCandidates(padSource, terms.matchAmount);
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
