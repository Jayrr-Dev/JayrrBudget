import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUser, requireRole, userRole } from "./lib/auth";
import { ensureModulesForUser } from "./lib/ensureModules";
import { roleAllowsModule } from "./lib/roles";

export const list = query({
  args: {
    enabledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return [];
    }
    const role = userRole(user);
    // Full catalog (enable/disable UI) is admin-only.
    if (!args.enabledOnly) {
      await requireRole(ctx, "admin");
    }
    const rows = await ctx.db
      .query("appModules")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return rows
      .filter((row) =>
        args.enabledOnly ? roleAllowsModule(role, row.slug) : true,
      )
      .filter((row) => (args.enabledOnly ? row.enabled : true))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({
        id: row.legacyId,
        slug: row.slug,
        name: row.name,
        description: row.description,
        href: row.href,
        icon: row.icon,
        category: row.category,
        enabled: Boolean(row.enabled),
        sortOrder: row.sortOrder,
        isCore: Boolean(row.isCore),
      }));
  },
});

/** Provision modules for the signed-in user's role (idempotent). */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureUser(ctx);
    const result = await ensureModulesForUser(ctx, user);
    return { ok: true as const, ...result };
  },
});

export const setEnabled = mutation({
  args: {
    slug: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    const row = await ctx.db
      .query("appModules")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", user._id).eq("slug", args.slug),
      )
      .unique();
    if (!row) {
      return { ok: false as const, error: "Module not found", status: 404 };
    }
    if (row.userId !== user._id) {
      return { ok: false as const, error: "Module not found", status: 404 };
    }
    if (row.isCore && !args.enabled) {
      return {
        ok: false as const,
        error: "Core modules cannot be disabled",
        status: 400,
      };
    }
    await ctx.db.patch(row._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
