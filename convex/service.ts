import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { utcMonthKey } from "./lib/aiCostTable";
import { requireRole, requireUser, userRole } from "./lib/auth";
import {
  DEFAULT_SERVICE_PLANS,
  defaultPlanForRole,
  type ServicePlanSeed,
} from "./lib/servicePlans";
import {
  chainFromPrimary,
  isCatalogModelId,
  OPENROUTER_MODEL_CATALOG,
} from "./lib/openRouterModels";
import { isUserRole, type UserRole } from "./lib/roles";

type DbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("normal"),
  v.literal("premium"),
);

const catalogRowValidator = v.object({
  id: v.string(),
  openRouterId: v.string(),
  label: v.string(),
  providerOnly: v.union(v.string(), v.null()),
});

const planValidator = v.object({
  role: roleValidator,
  name: v.string(),
  priceUsd: v.number(),
  monthlyCapUsd: v.union(v.number(), v.null()),
  rateMax: v.number(),
  rateWindowMs: v.number(),
  includedCanvas: v.boolean(),
});

function seedToPlan(seed: ServicePlanSeed) {
  return {
    role: seed.role,
    name: seed.name,
    priceUsd: seed.priceUsd,
    monthlyCapUsd: seed.monthlyCapUsd,
    rateMax: seed.rateMax,
    rateWindowMs: seed.rateWindowMs,
    includedCanvas: seed.includedCanvas,
  };
}

async function readPlan(ctx: DbCtx, role: UserRole) {
  const row = await ctx.db
    .query("servicePlans")
    .withIndex("by_role", (q) => q.eq("role", role))
    .unique();
  if (row) {
    return {
      role: row.role as UserRole,
      name: row.name,
      priceUsd: row.priceUsd,
      monthlyCapUsd: row.monthlyCapUsd,
      rateMax: row.rateMax,
      rateWindowMs: row.rateWindowMs,
      includedCanvas: row.includedCanvas,
    };
  }
  return seedToPlan(defaultPlanForRole(role));
}

async function ensurePlanRows(ctx: Pick<MutationCtx, "db">) {
  const now = Date.now();
  for (const seed of DEFAULT_SERVICE_PLANS) {
    const existing = await ctx.db
      .query("servicePlans")
      .withIndex("by_role", (q) => q.eq("role", seed.role))
      .unique();
    if (existing) continue;
    await ctx.db.insert("servicePlans", {
      role: seed.role,
      name: seed.name,
      priceUsd: seed.priceUsd,
      monthlyCapUsd: seed.monthlyCapUsd,
      rateMax: seed.rateMax,
      rateWindowMs: seed.rateWindowMs,
      includedCanvas: seed.includedCanvas,
      updatedAt: now,
    });
  }
}

async function platformSpendUsd(
  ctx: DbCtx,
  userId: Id<"users">,
  monthKey: string,
) {
  const row = await ctx.db
    .query("aiUsageMonths")
    .withIndex("by_userId_monthKey_billedTo", (q) =>
      q.eq("userId", userId).eq("monthKey", monthKey).eq("billedTo", "platform"),
    )
    .unique();
  return row?.estimatedUsd ?? 0;
}

const SERVICE_AI_KEY = "default" as const;

async function readAiConfig(ctx: DbCtx) {
  return await ctx.db
    .query("serviceAiConfig")
    .withIndex("by_key", (q) => q.eq("key", SERVICE_AI_KEY))
    .unique();
}

export const getAiModels = query({
  args: {},
  returns: v.object({
    primaryModelId: v.union(v.string(), v.null()),
    fallbackModelIds: v.array(v.string()),
    chain: v.array(v.string()),
    catalog: v.array(catalogRowValidator),
  }),
  handler: async (ctx) => {
    await requireUser(ctx);
    const row = await readAiConfig(ctx);
    const catalog = OPENROUTER_MODEL_CATALOG.map((item) => ({
      id: item.id,
      openRouterId: item.openRouterId,
      label: item.label,
      providerOnly: item.providerOnly,
    }));
    if (!row) {
      return {
        primaryModelId: null,
        fallbackModelIds: [],
        chain: [],
        catalog,
      };
    }
    return {
      primaryModelId: row.primaryModelId,
      fallbackModelIds: row.fallbackModelIds,
      chain:
        row.fallbackModelIds.length > 0
          ? [row.primaryModelId, ...row.fallbackModelIds]
          : chainFromPrimary(row.primaryModelId),
      catalog,
    };
  },
});

export const saveAiModels = mutation({
  args: {
    primaryModelId: v.string(),
  },
  returns: v.object({
    primaryModelId: v.string(),
    fallbackModelIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    if (!isCatalogModelId(args.primaryModelId)) {
      throw new Error("Unknown model");
    }
    const fallbackModelIds = chainFromPrimary(args.primaryModelId).slice(1);
    const now = Date.now();
    const existing = await readAiConfig(ctx);
    if (existing) {
      await ctx.db.patch(existing._id, {
        primaryModelId: args.primaryModelId,
        fallbackModelIds,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("serviceAiConfig", {
        key: SERVICE_AI_KEY,
        primaryModelId: args.primaryModelId,
        fallbackModelIds,
        updatedAt: now,
      });
    }
    return {
      primaryModelId: args.primaryModelId,
      fallbackModelIds,
    };
  },
});

export const listPlans = query({
  args: {},
  returns: v.array(planValidator),
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const rows = [];
    for (const seed of DEFAULT_SERVICE_PLANS) {
      rows.push(await readPlan(ctx, seed.role));
    }
    return rows;
  },
});

export const savePlan = mutation({
  args: {
    role: roleValidator,
    name: v.string(),
    priceUsd: v.number(),
    monthlyCapUsd: v.union(v.number(), v.null()),
    rateMax: v.number(),
    rateWindowMs: v.number(),
    includedCanvas: v.boolean(),
  },
  returns: planValidator,
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    if (!isUserRole(args.role)) {
      throw new Error("Invalid role");
    }
    const name = args.name.trim().slice(0, 40) || defaultPlanForRole(args.role).name;
    const priceUsd = Number.isFinite(args.priceUsd) ? Math.max(0, args.priceUsd) : 0;
    const monthlyCapUsd =
      args.monthlyCapUsd == null
        ? null
        : Math.max(0, args.monthlyCapUsd);
    const rateMax = Math.min(Math.max(Math.floor(args.rateMax), 1), 200);
    const rateWindowMs = Math.min(
      Math.max(Math.floor(args.rateWindowMs), 5_000),
      600_000,
    );
    const now = Date.now();
    const existing = await ctx.db
      .query("servicePlans")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        priceUsd,
        monthlyCapUsd,
        rateMax,
        rateWindowMs,
        includedCanvas: args.includedCanvas,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("servicePlans", {
        role: args.role,
        name,
        priceUsd,
        monthlyCapUsd,
        rateMax,
        rateWindowMs,
        includedCanvas: args.includedCanvas,
        updatedAt: now,
      });
    }
    return {
      role: args.role,
      name,
      priceUsd,
      monthlyCapUsd,
      rateMax,
      rateWindowMs,
      includedCanvas: args.includedCanvas,
    };
  },
});

export const ensurePlans = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    await ensurePlanRows(ctx);
    return null;
  },
});

export const myQuota = query({
  args: { monthKey: v.string() },
  returns: v.object({
    monthKey: v.string(),
    role: roleValidator,
    name: v.string(),
    priceUsd: v.number(),
    monthlyCapUsd: v.union(v.number(), v.null()),
    spentUsd: v.number(),
    remainingUsd: v.union(v.number(), v.null()),
    rateMax: v.number(),
    rateWindowMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!/^\d{4}-\d{2}$/.test(args.monthKey)) {
      throw new Error("Invalid month");
    }
    const role = userRole(user);
    const plan = await readPlan(ctx, role);
    const spentUsd = await platformSpendUsd(ctx, user._id, args.monthKey);
    const remainingUsd =
      plan.monthlyCapUsd == null
        ? null
        : Math.max(0, plan.monthlyCapUsd - spentUsd);
    return {
      monthKey: args.monthKey,
      role,
      name: plan.name,
      priceUsd: plan.priceUsd,
      monthlyCapUsd: plan.monthlyCapUsd,
      spentUsd,
      remainingUsd,
      rateMax: plan.rateMax,
      rateWindowMs: plan.rateWindowMs,
    };
  },
});

/** Free vs Premium copy for Profile billing. */
export const planCatalog = query({
  args: {},
  returns: v.object({
    free: planValidator,
    premium: planValidator,
  }),
  handler: async (ctx) => {
    await requireUser(ctx);
    return {
      free: await readPlan(ctx, "normal"),
      premium: await readPlan(ctx, "premium"),
    };
  },
});

export const teamMonth = query({
  args: { monthKey: v.string() },
  returns: v.object({
    monthKey: v.string(),
    plans: v.array(planValidator),
    users: v.array(
      v.object({
        userId: v.id("users"),
        email: v.union(v.string(), v.null()),
        name: v.union(v.string(), v.null()),
        role: roleValidator,
        spentUsd: v.number(),
        byokUsd: v.number(),
        monthlyCapUsd: v.union(v.number(), v.null()),
        callCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    if (!/^\d{4}-\d{2}$/.test(args.monthKey)) {
      throw new Error("Invalid month");
    }
    const plans = [];
    for (const seed of DEFAULT_SERVICE_PLANS) {
      plans.push(await readPlan(ctx, seed.role));
    }
    const planByRole = new Map(plans.map((plan) => [plan.role, plan]));
    const monthRows = await ctx.db
      .query("aiUsageMonths")
      .withIndex("by_monthKey", (q) => q.eq("monthKey", args.monthKey))
      .take(500);
    const users = await ctx.db.query("users").take(200);
    const spend = new Map<
      Id<"users">,
      { platform: number; byok: number; calls: number }
    >();
    for (const row of monthRows) {
      let entry = spend.get(row.userId);
      if (!entry) {
        entry = { platform: 0, byok: 0, calls: 0 };
        spend.set(row.userId, entry);
      }
      entry.calls += row.callCount;
      if (row.billedTo === "byok") entry.byok += row.estimatedUsd;
      else entry.platform += row.estimatedUsd;
    }
    const out = users.map((user) => {
      const role = userRole(user);
      const plan = planByRole.get(role) ?? seedToPlan(defaultPlanForRole(role));
      const used = spend.get(user._id);
      return {
        userId: user._id,
        email: user.email ?? null,
        name: user.name ?? null,
        role,
        spentUsd: used?.platform ?? 0,
        byokUsd: used?.byok ?? 0,
        monthlyCapUsd: plan.monthlyCapUsd,
        callCount: used?.calls ?? 0,
      };
    });
    out.sort((a, b) => b.spentUsd - a.spentUsd);
    return { monthKey: args.monthKey, plans, users: out };
  },
});

export const assertAiCall = mutation({
  args: {
    billedTo: v.union(v.literal("platform"), v.literal("byok")),
    usesPlatformOcr: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      code: v.union(v.literal("rate_limited"), v.literal("cap_exceeded")),
      error: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const role = userRole(user);
    const plan = await readPlan(ctx, role);
    const now = Date.now();
    const usesPlatform =
      args.billedTo === "platform" || args.usesPlatformOcr === true;

    if (plan.monthlyCapUsd != null && usesPlatform) {
      const spent = await platformSpendUsd(ctx, user._id, utcMonthKey(now));
      if (spent >= plan.monthlyCapUsd) {
        return {
          ok: false as const,
          code: "cap_exceeded" as const,
          error:
            "This month's included AI is used up. Add your own OpenRouter key or upgrade.",
        };
      }
    }

    const window = await ctx.db
      .query("aiRateWindows")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!window || now >= window.windowStart + plan.rateWindowMs) {
      if (window) {
        await ctx.db.patch(window._id, { windowStart: now, count: 1 });
      } else {
        await ctx.db.insert("aiRateWindows", {
          userId: user._id,
          windowStart: now,
          count: 1,
        });
      }
      return { ok: true as const };
    }
    if (window.count >= plan.rateMax) {
      return {
        ok: false as const,
        code: "rate_limited" as const,
        error: "Too many AI requests. Try again in a minute.",
      };
    }
    await ctx.db.patch(window._id, { count: window.count + 1 });
    return { ok: true as const };
  },
});
