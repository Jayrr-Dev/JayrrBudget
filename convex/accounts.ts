import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** Set a display nickname. Does not change accountId or the stored bank name. */
export const updateLabel = mutation({
  args: {
    accountId: v.string(),
    label: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId_accountId", (q) =>
        q.eq("userId", user._id).eq("accountId", args.accountId),
      )
      .unique();
    if (!account) {
      throw new Error("Account not found");
    }
    const trimmed = args.label?.trim() || null;
    await ctx.db.patch(account._id, {
      label: trimmed,
      updatedAt: Date.now(),
    });
    return null;
  },
});
