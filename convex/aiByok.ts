import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const providerValidator = v.literal("openrouter");

const statusValidator = v.object({
  configured: v.boolean(),
  last4: v.union(v.string(), v.null()),
});

const encryptedValidator = v.object({
  userId: v.id("users"),
  ciphertext: v.string(),
  iv: v.string(),
});

/** Masked status for Profile. Never returns ciphertext. */
export const status = query({
  args: {},
  returns: statusValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("userAiKeys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "openrouter"),
      )
      .unique();
    if (!row) {
      return { configured: false, last4: null };
    }
    return { configured: true, last4: row.last4 };
  },
});

/** Ciphertext for the Next.js AI routes. Plaintext is never stored. */
export const getEncrypted = query({
  args: {},
  returns: v.union(encryptedValidator, v.null()),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("userAiKeys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "openrouter"),
      )
      .unique();
    if (!row) return null;
    return {
      userId: user._id,
      ciphertext: row.ciphertext,
      iv: row.iv,
    };
  },
});

/** Store ciphertext produced by /api/profile/ai-key. */
export const putEncrypted = mutation({
  args: {
    provider: providerValidator,
    ciphertext: v.string(),
    iv: v.string(),
    last4: v.string(),
  },
  returns: statusValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.ciphertext.length > 4096 || args.iv.length > 64) {
      throw new Error("Invalid encrypted key payload");
    }
    if (!/^[0-9a-zA-Z]{4}$/.test(args.last4)) {
      throw new Error("Invalid key fingerprint");
    }
    const existing = await ctx.db
      .query("userAiKeys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider),
      )
      .unique();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ciphertext: args.ciphertext,
        iv: args.iv,
        last4: args.last4,
        updatedAt,
      });
    } else {
      await ctx.db.insert("userAiKeys", {
        userId: user._id,
        provider: args.provider,
        ciphertext: args.ciphertext,
        iv: args.iv,
        last4: args.last4,
        updatedAt,
      });
    }
    return { configured: true, last4: args.last4 };
  },
});

export const remove = mutation({
  args: { provider: providerValidator },
  returns: statusValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userAiKeys")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", user._id).eq("provider", args.provider),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { configured: false, last4: null };
  },
});
