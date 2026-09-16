import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { rememberCategorization } from "./categorizationMemory";
import { merchantSlug } from "./merchantSlug";
import { retargetTxnMerchant } from "./merchantTxnCount";

export type MerchantFields = {
  name: string;
  rawName?: string | null;
  company?: string | null;
  brand?: string | null;
  website?: string | null;
  logoUrl?: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function merchantLogoSrc(
  ctx: QueryCtx | MutationCtx,
  merchant: Pick<Doc<"merchants">, "logoUrl" | "logoStorageId">,
): Promise<string | null> {
  if (merchant.logoStorageId) {
    const stored = await ctx.storage.getUrl(merchant.logoStorageId);
    if (stored) return stored;
  }
  return merchant.logoUrl;
}

/**
 * Canonical display label for a ledger row.
 * Prefer merchantClean; legacy merchantName only as last resort.
 */
export function merchantLabelFromTxn(txn: {
  merchantClean?: string | null;
  merchantName?: string | null;
  company?: string | null;
  brand?: string | null;
}): string | null {
  return (
    trimOrNull(txn.merchantClean) ??
    trimOrNull(txn.company) ??
    trimOrNull(txn.brand) ??
    trimOrNull(txn.merchantName)
  );
}

/**
 * Upsert a per-user merchant by slug. Keeps richer company/brand/website when
 * the new write has values and the existing row is empty.
 */
export async function ensureMerchant(
  ctx: MutationCtx,
  userId: Id<"users">,
  fields: MerchantFields,
): Promise<Doc<"merchants">> {
  const name = fields.name.trim();
  if (!name) {
    throw new Error("Merchant name is required");
  }
  const slug = merchantSlug(name);
  if (!slug) {
    throw new Error("Merchant name produced an empty slug");
  }

  const now = Date.now();
  const rawName = trimOrNull(fields.rawName);
  const company = trimOrNull(fields.company);
  const brand = trimOrNull(fields.brand);
  const website = trimOrNull(fields.website);
  const logoUrl = trimOrNull(fields.logoUrl);

  const existing = await ctx.db
    .query("merchants")
    .withIndex("by_userId_slug", (q) => q.eq("userId", userId).eq("slug", slug))
    .unique();

  if (existing) {
    const patch: Partial<Doc<"merchants">> = { updatedAt: now };
    if (existing.name !== name) patch.name = name;
    if (rawName && existing.rawName !== rawName) patch.rawName = rawName;
    if (company && !existing.company) patch.company = company;
    if (brand && !existing.brand) patch.brand = brand;
    if (website && !existing.website) patch.website = website;
    if (logoUrl && !existing.logoUrl) patch.logoUrl = logoUrl;
    if (Object.keys(patch).length > 1) {
      await ctx.db.patch(existing._id, patch);
      return { ...existing, ...patch };
    }
    return existing;
  }

  const id = await ctx.db.insert("merchants", {
    userId,
    slug,
    name,
    rawName,
    company,
    brand,
    website,
    logoUrl,
    transactionCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("Merchant insert failed");
  return row;
}

/** Link owned transactions to a merchant; denormalize merchantClean (+ optional entity fields). */
export async function linkTxnsToMerchant(
  ctx: MutationCtx,
  userId: Id<"users">,
  merchant: Doc<"merchants">,
  transactionIds: string[],
): Promise<number> {
  let linked = 0;
  for (const transactionId of transactionIds) {
    const txn = await ctx.db
      .query("transactions")
      .withIndex("by_userId_transactionId", (q) =>
        q.eq("userId", userId).eq("transactionId", transactionId),
      )
      .unique();
    if (!txn) continue;
    const previous = txn.merchantId ?? null;
    await ctx.db.patch(txn._id, {
      merchantId: merchant._id,
      merchantClean: merchant.name,
      company: merchant.company ?? txn.company,
      brand: merchant.brand ?? txn.brand,
      website: merchant.website ?? txn.website,
      logoUrl: (await merchantLogoSrc(ctx, merchant)) ?? txn.logoUrl,
      updatedAt: Date.now(),
    });
    await retargetTxnMerchant(ctx, previous, merchant._id);
    const updated = await ctx.db.get(txn._id);
    if (updated) await rememberCategorization(ctx, updated);
    linked += 1;
  }
  return linked;
}

async function transactionsForMerchant(
  ctx: MutationCtx,
  userId: Id<"users">,
  merchantId: Id<"merchants">,
) {
  return await ctx.db
    .query("transactions")
    .withIndex("by_userId_merchantId", (q) =>
      q.eq("userId", userId).eq("merchantId", merchantId),
    )
    .collect();
}

async function applyMerchantToTxn(
  ctx: MutationCtx,
  txn: Doc<"transactions">,
  merchant: Doc<"merchants">,
) {
  const previous = txn.merchantId ?? null;
  await ctx.db.patch(txn._id, {
    merchantId: merchant._id,
    merchantClean: merchant.name,
    company: merchant.company,
    brand: merchant.brand,
    website: merchant.website,
    logoUrl: await merchantLogoSrc(ctx, merchant),
    updatedAt: Date.now(),
  });
  await retargetTxnMerchant(ctx, previous, merchant._id);
  const updated = await ctx.db.get(txn._id);
  if (updated) await rememberCategorization(ctx, updated);
}

export type MerchantEditFields = {
  name: string;
  logoUrl?: string | null;
  logoStorageId?: Id<"_storage"> | null;
};

/** Patch a merchant. Same slug as another payee merges into that row and relinks ledger lines. */
export async function updateMerchantOrMerge(
  ctx: MutationCtx,
  userId: Id<"users">,
  merchantId: Id<"merchants">,
  fields: MerchantEditFields,
): Promise<{
  merchant: Doc<"merchants">;
  merged: boolean;
  mergedFromName: string | null;
  transactionsUpdated: number;
}> {
  const source = await ctx.db.get(merchantId);
  if (!source || source.userId !== userId) {
    throw new Error("Merchant not found");
  }

  const name = fields.name.trim();
  if (!name) {
    throw new Error("Merchant name is required");
  }
  const slug = merchantSlug(name);
  if (!slug) {
    throw new Error("Merchant name produced an empty slug");
  }

  const now = Date.now();
  const patch: Partial<Doc<"merchants">> = {
    name,
    slug,
    updatedAt: now,
  };
  if (fields.logoUrl !== undefined) {
    patch.logoUrl = trimOrNull(fields.logoUrl);
  }
  if (fields.logoStorageId !== undefined) {
    const nextStorageId = fields.logoStorageId ?? undefined;
    if (source.logoStorageId && source.logoStorageId !== nextStorageId) {
      await ctx.storage.delete(source.logoStorageId);
    }
    patch.logoStorageId = nextStorageId;
  }

  const clash = await ctx.db
    .query("merchants")
    .withIndex("by_userId_slug", (q) => q.eq("userId", userId).eq("slug", slug))
    .unique();

  const merge = Boolean(clash && clash._id !== source._id);
  const keeperId = clash && clash._id !== source._id ? clash._id : source._id;
  await ctx.db.patch(keeperId, patch);
  const keeper = await ctx.db.get(keeperId);
  if (!keeper) {
    throw new Error("Merchant update failed");
  }

  const sourceTxns = await transactionsForMerchant(ctx, userId, source._id);
  const keeperTxns = merge
    ? await transactionsForMerchant(ctx, userId, keeper._id)
    : [];
  const seen = new Set<string>();
  let transactionsUpdated = 0;
  for (const txn of [...sourceTxns, ...keeperTxns]) {
    if (seen.has(txn._id)) continue;
    seen.add(txn._id);
    await applyMerchantToTxn(ctx, txn, keeper);
    transactionsUpdated += 1;
  }

  if (merge) {
    await ctx.db.delete(source._id);
  }

  return {
    merchant: keeper,
    merged: merge,
    mergedFromName: merge ? source.name : null,
    transactionsUpdated,
  };
}

const MERGE_TXN_PAGE = 80;

async function adoptRicherFields(
  ctx: MutationCtx,
  keeper: Doc<"merchants">,
  source: Doc<"merchants">,
) {
  const patch: Partial<Doc<"merchants">> = {};
  if (!keeper.company && source.company) patch.company = source.company;
  if (!keeper.brand && source.brand) patch.brand = source.brand;
  if (!keeper.website && source.website) patch.website = source.website;
  if (!keeper.logoUrl && source.logoUrl) patch.logoUrl = source.logoUrl;
  if (!keeper.logoStorageId && source.logoStorageId) {
    patch.logoStorageId = source.logoStorageId;
  }
  if (Object.keys(patch).length === 0) return keeper;
  await ctx.db.patch(keeper._id, patch);
  return { ...keeper, ...patch };
}

/**
 * Move ledger rows from source payees onto keeper, then delete empty sources.
 * Paginated so a cluster can drain across mutation calls.
 */
export async function drainMergeSources(
  ctx: MutationCtx,
  userId: Id<"users">,
  keeperId: Id<"merchants">,
  sourceIds: Id<"merchants">[],
  txnLimit = MERGE_TXN_PAGE,
): Promise<{
  keeper: Doc<"merchants">;
  transactionsUpdated: number;
  sourcesDeleted: number;
  sourcesRemaining: number;
  isDone: boolean;
}> {
  let keeper = await ctx.db.get(keeperId);
  if (!keeper || keeper.userId !== userId) {
    throw new Error("Merchant not found");
  }

  const uniqueSources = [...new Set(sourceIds)].filter((id) => id !== keeperId);
  let budget = Math.min(Math.max(txnLimit, 1), 200);
  let transactionsUpdated = 0;
  let sourcesDeleted = 0;
  let sourcesRemaining = 0;

  for (const sourceId of uniqueSources) {
    const source = await ctx.db.get(sourceId);
    if (!source || source.userId !== userId) continue;

    if (budget <= 0) {
      sourcesRemaining += 1;
      continue;
    }

    const page = await ctx.db
      .query("transactions")
      .withIndex("by_userId_merchantId", (q) =>
        q.eq("userId", userId).eq("merchantId", source._id),
      )
      .paginate({ numItems: budget, cursor: null });

    for (const txn of page.page) {
      await applyMerchantToTxn(ctx, txn, keeper);
      transactionsUpdated += 1;
      budget -= 1;
    }

    if (!page.isDone) {
      sourcesRemaining += 1;
      continue;
    }

    keeper = await adoptRicherFields(ctx, keeper, source);
    if (source.logoStorageId && source.logoStorageId !== keeper.logoStorageId) {
      await ctx.storage.delete(source.logoStorageId);
    }
    await ctx.db.delete(source._id);
    sourcesDeleted += 1;
  }

  return {
    keeper,
    transactionsUpdated,
    sourcesDeleted,
    sourcesRemaining,
    isDone: sourcesRemaining === 0,
  };
}
