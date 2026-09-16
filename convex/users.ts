import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole, requireUser, userRole } from "./lib/auth";
import { ensureModulesForUser } from "./lib/ensureModules";
import { isUserRole, USER_ROLES } from "./lib/roles";

/** Current signed-in Convex Auth user profile. Null when signed out / auth still hydrating. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return {
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: userRole(user),
      ocrMode: user.ocrMode === "local" ? "local" : "server",
    };
  },
});

const ocrModeValidator = v.union(v.literal("local"), v.literal("server"));

/** Local vs server document scan. */
export const updateOcrMode = mutation({
  args: { ocrMode: ocrModeValidator },
  returns: v.object({ ocrMode: ocrModeValidator }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { ocrMode: args.ocrMode });
    return { ocrMode: args.ocrMode };
  },
});

/** Update display name for the signed-in user. */
export const updateProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      throw new Error("First and last name are required");
    }
    const name = `${firstName} ${lastName}`;
    await ctx.db.patch(user._id, { name });
    return { name };
  },
});

/** Admin-only: change another user's role by email. */
export const setRoleByEmail = mutation({
  args: {
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("normal"),
      v.literal("premium"),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const email = args.email.trim().toLowerCase();
    if (!isUserRole(args.role)) {
      throw new Error(`Invalid role. Use one of: ${USER_ROLES.join(", ")}`);
    }
    const target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!target) {
      throw new Error(`No user with email ${email}`);
    }
    await ctx.db.patch(target._id, { role: args.role });
    const updated = await ctx.db.get(target._id);
    if (updated) {
      await ensureModulesForUser(ctx, updated);
    }
    return { userId: target._id, email, role: args.role };
  },
});
