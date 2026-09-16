import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { estimateAiUsageUsd, utcMonthKey } from "./lib/aiCostTable";
import { requireRole, requireUser } from "./lib/auth";

const billedToValidator = v.union(v.literal("platform"), v.literal("byok"));

const totalsValidator = v.object({
  callCount: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  pages: v.number(),
  estimatedUsd: v.number(),
});

const eventValidator = v.object({
  id: v.id("aiUsageEvents"),
  source: v.string(),
  modelId: v.string(),
  billedTo: billedToValidator,
  inputTokens: v.union(v.number(), v.null()),
  outputTokens: v.union(v.number(), v.null()),
  totalTokens: v.union(v.number(), v.null()),
  pages: v.union(v.number(), v.null()),
  estimatedUsd: v.union(v.number(), v.null()),
  ms: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

function emptyTotals() {
  return {
    callCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    pages: 0,
    estimatedUsd: 0,
  };
}

function isMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function finiteNonNeg(value: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

export const record = mutation({
  args: {
    source: v.string(),
    modelId: v.string(),
    billedTo: billedToValidator,
    inputTokens: v.union(v.number(), v.null()),
    outputTokens: v.union(v.number(), v.null()),
    totalTokens: v.union(v.number(), v.null()),
    pages: v.union(v.number(), v.null()),
    ms: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const pages = args.pages == null ? null : finiteNonNeg(args.pages);
    const inputTokens =
      args.inputTokens == null ? null : finiteNonNeg(args.inputTokens);
    const outputTokens =
      args.outputTokens == null ? null : finiteNonNeg(args.outputTokens);
    const totalTokens =
      args.totalTokens != null
        ? finiteNonNeg(args.totalTokens)
        : inputTokens != null || outputTokens != null
          ? (inputTokens ?? 0) + (outputTokens ?? 0)
          : null;
    if (
      (pages == null || pages <= 0) &&
      (totalTokens == null || totalTokens <= 0) &&
      (inputTokens == null || inputTokens <= 0) &&
      (outputTokens == null || outputTokens <= 0)
    ) {
      return null;
    }

    const createdAt = Date.now();
    const monthKey = utcMonthKey(createdAt);
    const estimatedUsd = estimateAiUsageUsd({
      modelId: args.modelId,
      inputTokens,
      outputTokens,
      pages,
    });
    const source = args.source.trim().slice(0, 80) || "unknown";
    const modelId = args.modelId.trim().slice(0, 160) || "unknown";

    await ctx.db.insert("aiUsageEvents", {
      userId: user._id,
      source,
      modelId,
      billedTo: args.billedTo,
      inputTokens,
      outputTokens,
      totalTokens,
      pages,
      estimatedUsd,
      ms: args.ms == null ? null : finiteNonNeg(args.ms),
      createdAt,
    });

    const month = await ctx.db
      .query("aiUsageMonths")
      .withIndex("by_userId_monthKey_billedTo", (q) =>
        q
          .eq("userId", user._id)
          .eq("monthKey", monthKey)
          .eq("billedTo", args.billedTo),
      )
      .unique();
    const usd = estimatedUsd ?? 0;
    if (month) {
      await ctx.db.patch(month._id, {
        callCount: month.callCount + 1,
        inputTokens: month.inputTokens + (inputTokens ?? 0),
        outputTokens: month.outputTokens + (outputTokens ?? 0),
        pages: month.pages + (pages ?? 0),
        estimatedUsd: month.estimatedUsd + usd,
        updatedAt: createdAt,
      });
    } else {
      await ctx.db.insert("aiUsageMonths", {
        userId: user._id,
        monthKey,
        billedTo: args.billedTo,
        callCount: 1,
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        pages: pages ?? 0,
        estimatedUsd: usd,
        updatedAt: createdAt,
      });
    }
    return null;
  },
});

export const myMonth = query({
  args: { monthKey: v.string() },
  returns: v.object({
    monthKey: v.string(),
    platform: totalsValidator,
    byok: totalsValidator,
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isMonthKey(args.monthKey)) {
      throw new Error("Invalid month");
    }
    const rows = await ctx.db
      .query("aiUsageMonths")
      .withIndex("by_userId_monthKey_billedTo", (q) =>
        q.eq("userId", user._id).eq("monthKey", args.monthKey),
      )
      .take(8);
    const platform = emptyTotals();
    const byok = emptyTotals();
    for (const row of rows) {
      const bucket = row.billedTo === "byok" ? byok : platform;
      bucket.callCount += row.callCount;
      bucket.inputTokens += row.inputTokens;
      bucket.outputTokens += row.outputTokens;
      bucket.pages += row.pages;
      bucket.estimatedUsd += row.estimatedUsd;
    }
    return { monthKey: args.monthKey, platform, byok };
  },
});

export const myRecent = query({
  args: {},
  returns: v.array(eventValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("aiUsageEvents")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(80);
    return rows.map((row) => ({
      id: row._id,
      source: row.source,
      modelId: row.modelId,
      billedTo: row.billedTo,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      pages: row.pages,
      estimatedUsd: row.estimatedUsd,
      ms: row.ms,
      createdAt: row.createdAt,
    }));
  },
});

export const adminMonth = query({
  args: { monthKey: v.string() },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      platform: totalsValidator,
      byok: totalsValidator,
    }),
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    if (!isMonthKey(args.monthKey)) {
      throw new Error("Invalid month");
    }
    const rows = await ctx.db
      .query("aiUsageMonths")
      .withIndex("by_monthKey", (q) => q.eq("monthKey", args.monthKey))
      .take(500);
    const byUser = new Map<
      Id<"users">,
      {
        userId: Id<"users">;
        platform: ReturnType<typeof emptyTotals>;
        byok: ReturnType<typeof emptyTotals>;
      }
    >();
    for (const row of rows) {
      const key = row.userId;
      let entry = byUser.get(key);
      if (!entry) {
        entry = {
          userId: row.userId,
          platform: emptyTotals(),
          byok: emptyTotals(),
        };
        byUser.set(key, entry);
      }
      const bucket = row.billedTo === "byok" ? entry.byok : entry.platform;
      bucket.callCount += row.callCount;
      bucket.inputTokens += row.inputTokens;
      bucket.outputTokens += row.outputTokens;
      bucket.pages += row.pages;
      bucket.estimatedUsd += row.estimatedUsd;
    }
    const out = [];
    for (const entry of byUser.values()) {
      const profile = await ctx.db.get(entry.userId);
      out.push({
        userId: entry.userId,
        email: profile?.email ?? null,
        name: profile?.name ?? null,
        platform: entry.platform,
        byok: entry.byok,
      });
    }
    return out.sort(
      (a, b) =>
        b.platform.estimatedUsd +
        b.byok.estimatedUsd -
        (a.platform.estimatedUsd + a.byok.estimatedUsd),
    );
  },
});
