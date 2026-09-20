import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** Keep in sync with src/domains/statements/domain/userAiRules.ts */
const MAX_RULES = 30;
const MAX_RULE_LENGTH = 400;

const rulesReturn = v.object({
  rules: v.array(v.string()),
  updatedAt: v.union(v.number(), v.null()),
});

function sanitizeRuleText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<\/?\s*owner_pref\b[^>]*>/gi, " ")
    .replace(/<<+|>>+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_RULE_LENGTH);
}

function normalizeRules(raw: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const clipped = sanitizeRuleText(entry);
    if (!clipped) continue;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(clipped);
    if (cleaned.length >= MAX_RULES) break;
  }
  return cleaned;
}

async function getOwnedDoc(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("userAiRules")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** Current user's classify rules for Jev / Classify. */
export const get = query({
  args: {},
  returns: rulesReturn,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await getOwnedDoc(ctx, user._id);
    if (!doc) {
      return { rules: [], updatedAt: null };
    }
    return { rules: doc.rules, updatedAt: doc.updatedAt };
  },
});

/**
 * Replace the signed-in user's classify rule list.
 * Rules are owner-scoped. Jev reads them on Classify.
 */
export const set = mutation({
  args: {
    rules: v.array(v.string()),
  },
  returns: rulesReturn,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rules = normalizeRules(args.rules);
    const now = Date.now();
    const existing = await getOwnedDoc(ctx, user._id);

    if (existing) {
      if (existing.userId !== user._id) {
        throw new Error("Unauthorized");
      }
      await ctx.db.patch(existing._id, { rules, updatedAt: now });
      return { rules, updatedAt: now };
    }

    await ctx.db.insert("userAiRules", {
      userId: user._id,
      rules,
      updatedAt: now,
    });
    return { rules, updatedAt: now };
  },
});
