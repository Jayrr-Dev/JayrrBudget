import type { MutationCtx } from "../_generated/server";
import { normalizedLabel } from "./categorization";

/** Shared tags everyone starts with. Travel is a section now, not a sticker. */
export const SEED_SHARED_TAGS: ReadonlyArray<{ name: string; description: string }> = [];

const RETIRED_SHARED_TAGS = ["Travel"] as const;

const PINNED = SEED_SHARED_TAGS.map((tag) => normalizedLabel(tag.name));

export function sortSharedTagNames(a: string, b: string) {
  const ap = PINNED.indexOf(normalizedLabel(a));
  const bp = PINNED.indexOf(normalizedLabel(b));
  if (ap !== bp) {
    if (ap === -1) return 1;
    if (bp === -1) return -1;
    return ap - bp;
  }
  return a.localeCompare(b);
}

export async function ensureSeedSharedTags(ctx: MutationCtx) {
  let added = 0;
  for (const tag of SEED_SHARED_TAGS) {
    const key = normalizedLabel(tag.name);
    const existing = await ctx.db
      .query("sharedTags")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      if (existing.description !== tag.description || existing.name !== tag.name) {
        await ctx.db.patch(existing._id, {
          name: tag.name,
          description: tag.description,
        });
      }
      continue;
    }
    await ctx.db.insert("sharedTags", {
      key,
      name: tag.name,
      description: tag.description,
    });
    added += 1;
  }
  for (const name of RETIRED_SHARED_TAGS) {
    const key = normalizedLabel(name);
    const existing = await ctx.db
      .query("sharedTags")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    const userTags = await ctx.db.query("transactionTags").collect();
    for (const row of userTags) {
      if (normalizedLabel(row.name) !== key) continue;
      await ctx.db.delete(row._id);
    }
  }
  return added;
}
