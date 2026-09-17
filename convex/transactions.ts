import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { ensureUser, requireUser } from "./lib/auth";
import { classifyCashFlow } from "./lib/cashFlow";
import { rememberCategorization } from "./lib/categorizationMemory";
import { ensureMerchant, linkTxnsToMerchant } from "./lib/ensureMerchant";
import { bumpMerchantTxnCount } from "./lib/merchantTxnCount";
import { hasTag, joinTags, splitTags } from "./lib/tags";
import {
  applyTaxonomyPatch,
  hasTaxonomyPatch,
  resolveTaxonomyPath,
  TaxonomyStore,
  type TaxonomyPatch,
} from "./lib/taxonomyPath";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Upper bound for one Piggy bulk edit / delete call. */
export const AI_BULK_LIMIT = 100;
export const AI_DELETE_LIMIT = 25;

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

async function ownedTransaction(
  ctx: MutationCtx,
  userId: Id<"users">,
  transactionId: string,
) {
  const id = transactionId.trim();
  if (!id) return null;
  return await ctx.db
    .query("transactions")
    .withIndex("by_userId_transactionId", (q) =>
      q.eq("userId", userId).eq("transactionId", id),
    )
    .unique();
}

function splitDebitCredit(amount: number) {
  if (amount > 0) return { debit: amount, credit: null };
  if (amount < 0) return { debit: null, credit: -amount };
  return { debit: null, credit: null };
}

export const taxonomy = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [sections, spreads, categories, subcategories] = await Promise.all([
      ctx.db
        .query("transactionSections")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("transactionSpreads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("transactionCategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("transactionSubcategories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const sectionByLegacy = new Map(
      sections.map((row) => [row.legacyId, row.name]),
    );
    const categoryByLegacy = new Map(
      categories.map((row) => [row.legacyId, row.name]),
    );

    return {
      sections: sections
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
        })),
      spreads: spreads
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
        })),
      categories: categories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
          sectionId: row.sectionLegacyId,
          sectionName:
            row.sectionLegacyId == null
              ? null
              : (sectionByLegacy.get(row.sectionLegacyId) ?? null),
        })),
      subcategories: subcategories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({
          id: row.legacyId,
          name: row.name,
          description: row.description,
          categoryId: row.categoryLegacyId,
          categoryName:
            row.categoryLegacyId == null
              ? null
              : (categoryByLegacy.get(row.categoryLegacyId) ?? null),
        })),
    };
  },
});


export const addTag = mutation({
  args: {
    transactionId: v.string(),
    tag: v.string(),
  },
  handler: async () => {
    throw new Error("addTag is retired. Use the private ledger (vault).");
  },
});

export const tagByDateRange = mutation({
  args: {
    tag: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    excludeTransactionIds: v.optional(v.array(v.string())),
  },
  handler: async () => {
    throw new Error("tagByDateRange is retired. Use the private ledger (vault).");
  },
});

export const updateTaxonomy = mutation({
  args: {
    transactionId: v.string(),
    field: v.union(
      v.literal("section"),
      v.literal("spread"),
      v.literal("category"),
      v.literal("subcategory"),
    ),
    value: v.union(v.string(), v.null()),
  },
  handler: async () => {
    throw new Error("updateTaxonomy is retired. Use the private ledger (vault).");
  },
});

export const renameDescriptions = mutation({
  args: {
    from: v.string(),
    to: v.string(),
    taxonomy: v.optional(
      v.object({
        section: v.union(v.string(), v.null()),
        category: v.union(v.string(), v.null()),
        subcategory: v.union(v.string(), v.null()),
      }),
    ),
  },
  returns: v.object({ updated: v.number() }),
  handler: async () => {
    throw new Error(
      "renameDescriptions is retired. Use the private ledger (vault).",
    );
  },
});

function merchantKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function rowMatchesMerchantName(
  row: {
    merchantClean: string | null;
    merchantName: string | null;
  },
  merchant: string,
) {
  const key = merchantKey(merchant);
  if (!key) return false;
  return (
    merchantKey(row.merchantClean) === key ||
    merchantKey(row.merchantName) === key
  );
}

const taxonomyPatchValidator = v.object({
  section: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  subcategory: v.union(v.string(), v.null()),
});

/** Apply section / category / subcategory to every row for one payee. */
export const recategorizeByMerchant = mutation({
  args: {
    merchant: v.string(),
    merchantId: v.optional(v.id("merchants")),
    taxonomy: taxonomyPatchValidator,
  },
  returns: v.object({ updated: v.number() }),
  handler: async () => {
    throw new Error(
      "recategorizeByMerchant is retired. Use the private ledger (vault).",
    );
  },
});

const aiTxnRow = v.object({
  transactionId: v.string(),
  accountId: v.string(),
  date: v.string(),
  description: v.string(),
  merchant: v.union(v.string(), v.null()),
  amount: v.number(),
  currency: v.string(),
  section: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  subcategory: v.union(v.string(), v.null()),
  tags: v.union(v.string(), v.null()),
});

function haystack(row: {
  description: string;
  merchantClean: string | null;
  merchantName: string | null;
  section: string | null;
  category: string | null;
  subcategory: string | null;
}) {
  return [
    row.description,
    row.merchantClean,
    row.merchantName,
    row.section,
    row.category,
    row.subcategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Resolve an AI-supplied account reference (id, name, official name, or last-4 mask). */
function findAiAccount<
  T extends {
    accountId: string;
    name: string;
    officialName: string | null;
    mask: string | null;
  },
>(accounts: T[], key: string | undefined) {
  const wanted = key?.trim();
  if (!wanted) return { account: null as T | null, missing: false };
  const lowered = norm(wanted);
  const account =
    accounts.find((row) => row.accountId === wanted) ??
    accounts.find((row) => norm(row.name) === lowered) ??
    accounts.find((row) => norm(row.officialName) === lowered) ??
    accounts.find((row) => row.mask && wanted.endsWith(row.mask)) ??
    accounts.find((row) => norm(row.name).includes(lowered)) ??
    null;
  return { account, missing: account === null };
}

function toAiTxn(row: {
  transactionId: string;
  accountId: string;
  posted: string;
  description: string;
  merchantClean: string | null;
  merchantName: string | null;
  amount: number;
  currency: string;
  section: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string | null;
}) {
  return {
    transactionId: row.transactionId,
    accountId: row.accountId,
    date: row.posted,
    description: row.description,
    merchant: row.merchantClean ?? row.merchantName,
    amount: row.amount,
    currency: row.currency,
    section: row.section,
    category: row.category,
    subcategory: row.subcategory,
    tags: row.tags,
  };
}

/** Bounded search over the signed-in user's ledger for Ledger AI. */
export const searchForAi = query({
  args: {
    query: v.optional(v.string()),
    merchant: v.optional(v.string()),
    section: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    /** Account id, name, or last-4 mask. Narrows to one account. */
    account: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    matches: v.array(aiTxnRow),
    scanned: v.number(),
    truncated: v.boolean(),
    /** Set when `account` was given but matched none of the user's accounts. */
    accountNotFound: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = Math.min(
      AI_BULK_LIMIT,
      Math.max(1, Math.floor(args.limit ?? 25)),
    );
    let accountId: string | null = null;
    if (args.account?.trim()) {
      const accounts = await ctx.db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const found = findAiAccount(accounts, args.account);
      if (found.missing) {
        return { matches: [], scanned: 0, truncated: false, accountNotFound: true };
      }
      accountId = found.account?.accountId ?? null;
    }
    const qText = args.query?.trim().toLowerCase() ?? "";
    const merchant = args.merchant?.trim().toLowerCase() ?? "";
    const section = args.section?.trim().toLowerCase() ?? "";
    const category = args.category?.trim().toLowerCase() ?? "";
    const subcategory = args.subcategory?.trim().toLowerCase() ?? "";
    const startDate = args.startDate?.trim() || null;
    const endDate = args.endDate?.trim() || null;

    const rows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => {
        const base = q.eq("userId", user._id);
        if (startDate && endDate) {
          return base.gte("posted", startDate).lte("posted", endDate);
        }
        if (startDate) return base.gte("posted", startDate);
        if (endDate) return base.lte("posted", endDate);
        return base;
      })
      .order("desc")
      .take(500);

    const matches = [];
    for (const row of rows) {
      if (accountId && row.accountId !== accountId) continue;
      if (merchant) {
        const label = `${row.merchantClean ?? ""} ${row.merchantName ?? ""}`.toLowerCase();
        if (!label.includes(merchant)) continue;
      }
      if (section && norm(row.section) !== section) continue;
      if (category && norm(row.category) !== category) continue;
      if (subcategory && norm(row.subcategory) !== subcategory) continue;
      if (qText && !haystack(row).includes(qText)) continue;
      matches.push(toAiTxn(row));
      if (matches.length >= limit) break;
    }

    return {
      matches,
      scanned: rows.length,
      truncated: rows.length === 500,
    };
  },
});

/** Spend totals for the signed-in user, grouped for Ledger AI. */
export const summarizeForAi = query({
  args: {
    groupBy: v.union(
      v.literal("merchant"),
      v.literal("section"),
      v.literal("category"),
      v.literal("subcategory"),
    ),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    /** Account id, name, or last-4 mask. Narrows to one account. */
    account: v.optional(v.string()),
  },
  returns: v.object({
    groupBy: v.string(),
    scanned: v.number(),
    truncated: v.boolean(),
    /** Set when `account` was given but matched none of the user's accounts. */
    accountNotFound: v.optional(v.boolean()),
    spendTotal: v.number(),
    incomeTotal: v.number(),
    /** Money moved between own accounts / card payoffs. Excluded from spend and income. */
    transferTotal: v.number(),
    groups: v.array(
      v.object({
        name: v.string(),
        spend: v.number(),
        income: v.number(),
        count: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const startDate = args.startDate?.trim() || null;
    const endDate = args.endDate?.trim() || null;

    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const accountTypeById = new Map(
      accounts.map((account) => [account.accountId, account.type ?? null]),
    );
    const found = findAiAccount(accounts, args.account);
    if (found.missing) {
      return {
        groupBy: args.groupBy,
        scanned: 0,
        truncated: false,
        accountNotFound: true,
        spendTotal: 0,
        incomeTotal: 0,
        transferTotal: 0,
        groups: [],
      };
    }
    const onlyAccountId = found.account?.accountId ?? null;

    const allRows = await ctx.db
      .query("transactions")
      .withIndex("by_userId_posted", (q) => {
        const base = q.eq("userId", user._id);
        if (startDate && endDate) {
          return base.gte("posted", startDate).lte("posted", endDate);
        }
        if (startDate) return base.gte("posted", startDate);
        if (endDate) return base.lte("posted", endDate);
        return base;
      })
      .order("desc")
      .take(1500);
    const rows = onlyAccountId
      ? allRows.filter((row) => row.accountId === onlyAccountId)
      : allRows;

    const buckets = new Map<
      string,
      { spend: number; income: number; count: number }
    >();
    let spendTotal = 0;
    let incomeTotal = 0;
    let transferTotal = 0;

    for (const row of rows) {
      const kind = classifyCashFlow({
        amountMinor: Math.round(row.amount * 100),
        description: row.description,
        accountType: accountTypeById.get(row.accountId) ?? null,
        sectionName: row.section,
        categoryName: row.category,
        typeName: row.subcategory,
        transactionCode: row.txnCode,
      });
      // Own-account moves (e.g. "Internet Transfer", card payoffs) are not spend.
      if (kind === "transfer_out") {
        transferTotal += row.amount;
        continue;
      }
      if (kind === "transfer_in" || kind === "refund") continue;

      let name = "Unlabeled";
      if (args.groupBy === "merchant") {
        name = row.merchantClean || row.merchantName || "Unknown";
      } else if (args.groupBy === "section") {
        name = row.section || "Unlabeled";
      } else if (args.groupBy === "category") {
        name = row.category || "Unlabeled";
      } else {
        name = row.subcategory || "Unlabeled";
      }

      const bucket = buckets.get(name) ?? { spend: 0, income: 0, count: 0 };
      bucket.count += 1;
      if (row.amount > 0) {
        bucket.spend += row.amount;
        spendTotal += row.amount;
      } else if (row.amount < 0) {
        const income = Math.abs(row.amount);
        bucket.income += income;
        incomeTotal += income;
      }
      buckets.set(name, bucket);
    }

    const groups = [...buckets.entries()]
      .map(([name, bucket]) => ({
        name,
        spend: Number(bucket.spend.toFixed(2)),
        income: Number(bucket.income.toFixed(2)),
        count: bucket.count,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 20);

    return {
      groupBy: args.groupBy,
      scanned: rows.length,
      truncated: allRows.length === 1500,
      spendTotal: Number(spendTotal.toFixed(2)),
      incomeTotal: Number(incomeTotal.toFixed(2)),
      transferTotal: Number(transferTotal.toFixed(2)),
      groups,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Piggy (Ledger AI) write surface. Every call is owner-scoped.        */
/* ------------------------------------------------------------------ */

const nullableString = v.union(v.string(), v.null());

/** One patch shape for single and bulk edits. `undefined` leaves a field alone. */
const aiPatchValidator = v.object({
  description: v.optional(v.string()),
  posted: v.optional(v.string()),
  amount: v.optional(v.number()),
  pending: v.optional(v.boolean()),
  section: v.optional(nullableString),
  category: v.optional(nullableString),
  subcategory: v.optional(nullableString),
  spread: v.optional(nullableString),
  addTags: v.optional(v.array(v.string())),
  removeTags: v.optional(v.array(v.string())),
  /** Merchant display name. `null` unlinks the row from its merchant. */
  merchant: v.optional(nullableString),
});

type AiPatch = {
  description?: string;
  posted?: string;
  amount?: number;
  pending?: boolean;
  addTags?: string[];
  removeTags?: string[];
  merchant?: string | null;
} & TaxonomyPatch;

type ResolvedMerchant = Doc<"merchants"> | null | undefined;

function assertAiPatch(patch: AiPatch) {
  if (patch.description !== undefined && !patch.description.trim()) {
    throw new Error("Description cannot be empty");
  }
  if (patch.posted !== undefined && !DATE_RE.test(patch.posted.trim())) {
    throw new Error("posted must be YYYY-MM-DD");
  }
  if (patch.amount !== undefined && !Number.isFinite(patch.amount)) {
    throw new Error("amount must be a finite number");
  }
  if (patch.merchant !== undefined && patch.merchant !== null && !patch.merchant.trim()) {
    throw new Error("merchant cannot be empty; pass null to unlink");
  }
  const touched = Object.values(patch).some((value) => value !== undefined);
  if (!touched) throw new Error("Nothing to update");
}

/** Resolve the merchant once so bulk edits do not upsert per row. */
async function resolveAiMerchant(
  ctx: MutationCtx,
  userId: Id<"users">,
  merchant: string | null | undefined,
): Promise<ResolvedMerchant> {
  if (merchant === undefined) return undefined;
  if (merchant === null) return null;
  return await ensureMerchant(ctx, userId, { name: merchant });
}

function nextTags(current: string | null, patch: AiPatch) {
  const remove = new Set((patch.removeTags ?? []).map((tag) => norm(tag)));
  const kept = splitTags(current).filter((tag) => !remove.has(norm(tag)));
  return joinTags([...kept, ...(patch.addTags ?? [])]);
}

/**
 * Apply one AI patch to an owned row. Taxonomy cascades through the shared
 * store, tags merge case-insensitively, and the merchant link is retargeted.
 */
async function applyAiPatch(
  ctx: MutationCtx,
  userId: Id<"users">,
  store: TaxonomyStore,
  row: Doc<"transactions">,
  patch: AiPatch,
  merchant: ResolvedMerchant,
): Promise<string[]> {
  const changed: string[] = [];
  const next: Partial<Doc<"transactions">> = {};

  if (patch.description !== undefined) {
    const description = patch.description.trim();
    if (description !== row.description) {
      next.description = description;
      if (row.originalDescription == null) {
        next.originalDescription = row.description;
      }
      changed.push("description");
    }
  }
  if (patch.posted !== undefined && patch.posted.trim() !== row.posted) {
    next.posted = patch.posted.trim();
    changed.push("posted");
  }
  if (patch.amount !== undefined && patch.amount !== row.amount) {
    next.amount = patch.amount;
    Object.assign(next, splitDebitCredit(patch.amount));
    changed.push("amount");
  }
  if (patch.pending !== undefined && patch.pending !== row.pending) {
    next.pending = patch.pending;
    changed.push("pending");
  }
  if (hasTaxonomyPatch(patch)) {
    Object.assign(next, await applyTaxonomyPatch(store, row, patch));
    changed.push("taxonomy");
  }
  if (patch.addTags?.length || patch.removeTags?.length) {
    const tags = nextTags(row.tags, patch);
    if (tags !== row.tags) {
      next.tags = tags;
      changed.push("tags");
    }
  }
  if (merchant === null && row.merchantId) {
    next.merchantId = null;
    next.merchantClean = null;
    await bumpMerchantTxnCount(ctx, row.merchantId, -1);
    changed.push("merchant");
  }

  if (Object.keys(next).length > 0) {
    await ctx.db.patch(row._id, { ...next, updatedAt: Date.now() });
  }

  if (merchant) {
    await linkTxnsToMerchant(ctx, userId, merchant, [row.transactionId]);
    changed.push("merchant");
  } else if (Object.keys(next).length > 0) {
    const updated = await ctx.db.get(row._id);
    if (updated) await rememberCategorization(ctx, updated);
  }

  return changed;
}

/** Edit one owned transaction in a single round trip. */
export const updateForAi = mutation({
  args: {
    transactionId: v.string(),
    patch: aiPatchValidator,
  },
  returns: v.object({
    transaction: aiTxnRow,
    changed: v.array(v.string()),
  }),
  handler: async () => {
    throw new Error("updateForAi is retired. Use the private ledger (vault).");
  },
});

/** Apply one patch to many owned transactions (max AI_BULK_LIMIT). */
export const bulkUpdateForAi = mutation({
  args: {
    transactionIds: v.array(v.string()),
    patch: aiPatchValidator,
  },
  returns: v.object({
    updated: v.number(),
    missing: v.array(v.string()),
    changed: v.array(v.string()),
  }),
  handler: async () => {
    throw new Error(
      "bulkUpdateForAi is retired. Use the private ledger (vault).",
    );
  },
});

/** Delete owned transactions (max AI_DELETE_LIMIT). Merchant counts stay in sync. */
export const deleteForAi = mutation({
  args: { transactionIds: v.array(v.string()) },
  returns: v.object({
    deleted: v.number(),
    missing: v.array(v.string()),
  }),
  handler: async () => {
    throw new Error("deleteForAi is retired. Use the private ledger (vault).");
  },
});

/** Account names Piggy can target with createForAi. */
export const accountsForAi = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.string(),
      name: v.string(),
      officialName: v.union(v.string(), v.null()),
      mask: v.union(v.string(), v.null()),
      type: v.union(v.string(), v.null()),
      subtype: v.union(v.string(), v.null()),
      currency: v.union(v.string(), v.null()),
      balance: v.union(v.number(), v.null()),
      available: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return accounts
      .map((row) => ({
        accountId: row.accountId,
        name: row.name,
        officialName: row.officialName,
        mask: row.mask,
        type: row.type,
        subtype: row.subtype,
        currency: row.isoCurrencyCode,
        balance: row.currentBalance,
        available: row.availableBalance,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Add a manual line to one of the user's accounts. Positive amount = spend, negative = money in. */
export const createForAi = mutation({
  args: {
    account: v.string(),
    posted: v.string(),
    description: v.string(),
    amount: v.number(),
    currency: v.optional(v.string()),
    section: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    merchant: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: aiTxnRow,
  handler: async () => {
    throw new Error("createForAi is retired. Use the private ledger (vault).");
  },
});
