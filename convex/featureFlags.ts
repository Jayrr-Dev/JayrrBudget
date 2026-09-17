import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole, requireUser } from "./lib/auth";

export const FEATURE_FLAG_KEYS = [
  "encryptedLedger",
  "cloudProcessing",
  "jevCategorization",
  "jevPiggy",
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

const keyValidator = v.union(
  v.literal("encryptedLedger"),
  v.literal("cloudProcessing"),
  v.literal("jevCategorization"),
  v.literal("jevPiggy"),
);

function isKnownKey(key: string): key is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(key);
}

export const list = query({
  args: {},
  returns: v.array(v.object({
    key: keyValidator,
    enabled: v.boolean(),
    updatedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db.query("featureFlags").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return FEATURE_FLAG_KEYS.map((key) => {
      const row = byKey.get(key);
      return { key, enabled: Boolean(row?.enabled), updatedAt: row?.updatedAt ?? null };
    });
  },
});

export const get = query({
  args: { key: keyValidator },
  returns: v.object({ key: keyValidator, enabled: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.query("featureFlags").withIndex("by_userId_key", (q) => q.eq("userId", user._id).eq("key", args.key)).unique();
    return { key: args.key, enabled: Boolean(row?.enabled) };
  },
});

export const set = mutation({
  args: { key: keyValidator, enabled: v.boolean() },
  returns: v.object({ key: keyValidator, enabled: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    if (!isKnownKey(args.key)) throw new Error(`Unknown feature flag: ${args.key}`);
    const existing = await ctx.db.query("featureFlags").withIndex("by_userId_key", (q) => q.eq("userId", user._id).eq("key", args.key)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { enabled: args.enabled, updatedAt: now });
    } else {
      await ctx.db.insert("featureFlags", { userId: user._id, key: args.key, enabled: args.enabled, updatedAt: now });
    }
    return { key: args.key, enabled: args.enabled };
  },
});
