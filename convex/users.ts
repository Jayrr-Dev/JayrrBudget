import { mutation, query } from "./_generated/server";
import { ensureUser, requireIdentity } from "./lib/auth";

/** Ensure a Convex users row exists for the signed-in Clerk identity. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureUser(ctx);
    return {
      userId: user._id,
      email: user.email,
      name: user.name,
    };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    return {
      userId: user._id,
      email: user.email,
      name: user.name,
    };
  },
});
