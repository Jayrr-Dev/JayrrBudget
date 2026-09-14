import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUser, requireUser } from "./lib/auth";

const SEED_MODULES = [
  {
    slug: "overview",
    name: "Overview",
    description: "Bank-style balances by account category.",
    href: "/",
    icon: "IconLayoutDashboard",
    category: "core",
    enabled: true,
    sortOrder: 10,
    isCore: true,
  },
  {
    slug: "analysis",
    name: "Analysis",
    description: "Spending and cost trends over time.",
    href: "/analysis",
    icon: "IconChartAreaLine",
    category: "finance",
    enabled: true,
    sortOrder: 15,
    isCore: false,
  },
  {
    slug: "accounts",
    name: "Accounts",
    description: "Linked and statement accounts.",
    href: "/accounts",
    icon: "IconBuildingBank",
    category: "finance",
    enabled: true,
    sortOrder: 20,
    isCore: false,
  },
  {
    slug: "transactions",
    name: "Transactions",
    description: "Ledger with merchant enrichment.",
    href: "/transactions",
    icon: "IconArrowsExchange",
    category: "finance",
    enabled: true,
    sortOrder: 30,
    isCore: false,
  },
  {
    slug: "statements",
    name: "Statements",
    description: "Import PDFs, overview stats, and parse logs.",
    href: "/statements",
    icon: "IconFileUpload",
    category: "finance",
    enabled: true,
    sortOrder: 40,
    isCore: false,
  },
  {
    slug: "canvas",
    name: "Canvas",
    description: "Budget canvas workspace.",
    href: "/canvas",
    icon: "IconLayoutBoard",
    category: "core",
    enabled: true,
    sortOrder: 50,
    isCore: false,
  },
  {
    slug: "database",
    name: "Database",
    description: "Schema map and live table browser.",
    href: "/database",
    icon: "IconDatabase",
    category: "system",
    enabled: true,
    sortOrder: 90,
    isCore: false,
  },
  {
    slug: "modules",
    name: "Modules",
    description: "Enable or disable product modules.",
    href: "/modules",
    icon: "IconPuzzle",
    category: "system",
    enabled: true,
    sortOrder: 100,
    isCore: true,
  },
] as const;

export const list = query({
  args: {
    enabledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("appModules")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return rows
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

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureUser(ctx);
    const existing = await ctx.db
      .query("appModules")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const bySlug = new Map(existing.map((row) => [row.slug, row]));
    const now = Date.now();
    let nextLegacy =
      existing.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;

    for (const seed of SEED_MODULES) {
      const found = bySlug.get(seed.slug);
      if (found) {
        await ctx.db.patch(found._id, {
          name: seed.name,
          description: seed.description,
          href: seed.href,
          icon: seed.icon,
          category: seed.category,
          sortOrder: seed.sortOrder,
          isCore: seed.isCore,
          updatedAt: now,
        });
        continue;
      }
      await ctx.db.insert("appModules", {
        userId: user._id,
        legacyId: nextLegacy++,
        ...seed,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

export const setEnabled = mutation({
  args: {
    slug: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
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
