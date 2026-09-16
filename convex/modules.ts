import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUser, requireRole, userRole } from "./lib/auth";
import { ensureModulesForUser } from "./lib/ensureModules";
import { MODULE_CATALOG } from "./lib/moduleCatalog";
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
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const merged = MODULE_CATALOG.filter((seed) =>
      args.enabledOnly ? roleAllowsModule(role, seed.slug) : true,
    ).map((seed) => {
      const row = bySlug.get(seed.slug);
      return {
        id: row?.legacyId ?? seed.sortOrder,
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        href: seed.href,
        icon: seed.icon,
        category: seed.category,
        enabled: row ? Boolean(row.enabled) : true,
        sortOrder: seed.sortOrder,
        isCore: seed.isCore,
      };
    });
    return merged
      .filter((row) => (args.enabledOnly ? row.enabled : true))
      .sort((a, b) => a.sortOrder - b.sortOrder);
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
    const seed = MODULE_CATALOG.find((entry) => entry.slug === args.slug);
    if (!seed) {
      return { ok: false as const, error: "Module not found", status: 404 };
    }
    let row = await ctx.db
      .query("appModules")
      .withIndex("by_userId_slug", (q) =>
        q.eq("userId", user._id).eq("slug", args.slug),
      )
      .unique();
    if (!row) {
      const existing = await ctx.db
        .query("appModules")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const now = Date.now();
      const legacyId =
        existing.reduce((max, item) => Math.max(max, item.legacyId), 0) + 1;
      const id = await ctx.db.insert("appModules", {
        userId: user._id,
        legacyId,
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        href: seed.href,
        icon: seed.icon,
        category: seed.category,
        enabled: args.enabled,
        sortOrder: seed.sortOrder,
        isCore: seed.isCore,
        createdAt: now,
        updatedAt: now,
      });
      row = await ctx.db.get(id);
    }
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
