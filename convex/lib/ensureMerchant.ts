import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { merchantSlug } from "./merchantSlug";

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
    .withIndex("by_userId_slug", (q) =>
      q.eq("userId", userId).eq("slug", slug),
    )
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
    await ctx.db.patch(txn._id, {
      merchantId: merchant._id,
      merchantClean: merchant.name,
      company: merchant.company ?? txn.company,
      brand: merchant.brand ?? txn.brand,
      website: merchant.website ?? txn.website,
      logoUrl: merchant.logoUrl ?? txn.logoUrl,
    });
    linked += 1;
  }
  return linked;
}
