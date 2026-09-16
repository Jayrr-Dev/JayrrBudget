import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function bumpMerchantTxnCount(
  ctx: MutationCtx,
  merchantId: Id<"merchants"> | null | undefined,
  delta: number,
) {
  if (!merchantId || delta === 0) return;
  const row = await ctx.db.get(merchantId);
  if (!row) return;
  const next = Math.max(0, (row.transactionCount ?? 0) + delta);
  if (next === (row.transactionCount ?? 0)) return;
  await ctx.db.patch(merchantId, { transactionCount: next });
}

/** Keep denormalized merchant.transactionCount in sync when a row's merchantId changes. */
export async function retargetTxnMerchant(
  ctx: MutationCtx,
  previous: Id<"merchants"> | null | undefined,
  next: Id<"merchants"> | null | undefined,
) {
  if (previous === next) return;
  await bumpMerchantTxnCount(ctx, previous, -1);
  await bumpMerchantTxnCount(ctx, next, 1);
}

export async function countTxnsForMerchant(
  ctx: MutationCtx,
  userId: Id<"users">,
  merchantId: Id<"merchants">,
) {
  let count = 0;
  let cursor: string | null = null;
  for (;;) {
    const page = await ctx.db
      .query("transactions")
      .withIndex("by_userId_merchantId", (q) =>
        q.eq("userId", userId).eq("merchantId", merchantId),
      )
      .paginate({ numItems: 1000, cursor });
    count += page.page.length;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return count;
}
