import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { descriptionKey, isCategorized, taxonomyKey } from "./categorization";
import { splitTags } from "./tags";
import { TXN_CODES } from "./txnCodes";

export async function rememberCategorization(ctx: MutationCtx, row: Doc<"transactions">) {
  if (!row.userId) return;
  const key = descriptionKey(row.description, row.amount);
  const old = await ctx.db.query("categorizationRules").withIndex("by_userId_key", q => q.eq("userId", row.userId!).eq("key", key)).unique();
  if (!isCategorized(row) || !(TXN_CODES as readonly string[]).includes(row.txnCode!) || !["online", "in_store", "other"].includes(row.channel!)) {
    if (old) await ctx.db.delete(old._id);
    return;
  }
  const pathKey = taxonomyKey(row.section!, row.category!, row.subcategory);
  const path = await ctx.db.query("sharedCategoryPaths").withIndex("by_key", q => q.eq("key", pathKey)).unique();
  if (!path) await ctx.db.insert("sharedCategoryPaths", { key: pathKey, section: row.section!, category: row.category!, subcategory: row.subcategory });
  const profile = { merchant: row.merchantClean!, pathKey, spread: row.spread!,
    transactionType: row.transactionType!, txnCode: row.txnCode!, channel: row.channel!,
    tags: splitTags(row.tags) };
  if (old) await ctx.db.patch(old._id, { profile, updatedAt: Date.now() });
  else await ctx.db.insert("categorizationRules", { userId: row.userId, key, profile, updatedAt: Date.now() });
}
