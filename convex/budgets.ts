import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { budgetPingTrigger } from "./lib/budgetPingTrigger";

const budgetCycle = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("yearly"),
);

const pingLinkValidator = v.object({
  pingId: v.id("piggyPings"),
  warn: v.boolean(),
  over: v.boolean(),
});

const budgetRecord = v.object({
  id: v.id("budgets"),
  name: v.string(),
  classLookup: v.union(v.string(), v.null()),
  descriptionLookup: v.union(v.string(), v.null()),
  amount: v.number(),
  warningThreshold: v.number(),
  overageThreshold: v.number(),
  isActive: v.boolean(),
  cycle: budgetCycle,
  startDate: v.string(),
  pingLinks: v.array(pingLinkValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const optionalText = v.optional(v.union(v.string(), v.null()));
const CYCLES = ["daily", "weekly", "biweekly", "monthly", "yearly"] as const;

function ymdFromMs(ms: number) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function requireCycle(value: string | undefined) {
  const key = (value?.trim().toLowerCase() || "monthly") as string;
  if (!(CYCLES as readonly string[]).includes(key)) {
    throw new Error(
      "Cycle must be Daily, Weekly, Bi-Weekly, Monthly, or Yearly",
    );
  }
  return key as (typeof CYCLES)[number];
}

function requireStartDate(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return ymdFromMs(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Start date must be YYYY-MM-DD");
  }
  return trimmed;
}

const MAX_NAME = 80;
const MAX_LOOKUP = 160;

function requiredText(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed.slice(0, max);
}

function optionalTrim(value: string | null | undefined, max: number) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function requireAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Amount must be zero or more");
  }
  return value;
}

function requireThreshold(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or more`);
  }
  return value;
}

async function sanitizePingLinks(
  ctx: {
    db: {
      get: (id: Id<"piggyPings">) => Promise<Doc<"piggyPings"> | null>;
    };
  },
  userId: Id<"users">,
  links:
    | Array<{ pingId: Id<"piggyPings">; warn: boolean; over: boolean }>
    | undefined,
) {
  if (!links) return [];
  const seen = new Set<string>();
  const out: Array<{
    pingId: Id<"piggyPings">;
    warn: boolean;
    over: boolean;
  }> = [];
  for (const link of links) {
    if (!link.warn && !link.over) continue;
    if (seen.has(link.pingId)) continue;
    const ping = await ctx.db.get(link.pingId);
    if (!ping || ping.userId !== userId) {
      throw new Error("Ping not found");
    }
    seen.add(link.pingId);
    out.push({
      pingId: link.pingId,
      warn: link.warn,
      over: link.over,
    });
  }
  return out;
}

async function syncLinkedPings(
  ctx: {
    db: {
      get: (id: Id<"piggyPings">) => Promise<Doc<"piggyPings"> | null>;
      patch: (
        id: Id<"piggyPings">,
        value: Partial<Doc<"piggyPings">>,
      ) => Promise<void>;
    };
  },
  userId: Id<"users">,
  budgetName: string,
  links: Array<{ pingId: Id<"piggyPings">; warn: boolean; over: boolean }>,
) {
  const now = Date.now();
  for (const link of links) {
    const ping = await ctx.db.get(link.pingId);
    if (!ping || ping.userId !== userId) continue;
    await ctx.db.patch(link.pingId, {
      cycle: "None",
      trigger: budgetPingTrigger(budgetName, link.warn, link.over),
      updatedAt: now,
    });
  }
}

function toRecord(doc: Doc<"budgets">) {
  return {
    id: doc._id,
    name: doc.name,
    classLookup: doc.classLookup,
    descriptionLookup: doc.descriptionLookup,
    amount: doc.amount,
    warningThreshold: doc.warningThreshold,
    overageThreshold: doc.overageThreshold,
    isActive: doc.isActive !== false,
    cycle: requireCycle(doc.cycle),
    startDate:
      doc.startDate && /^\d{4}-\d{2}-\d{2}$/.test(doc.startDate.trim())
        ? doc.startDate.trim()
        : "",
    pingLinks: (doc.pingLinks ?? []).filter(
      (link) => link.warn || link.over,
    ),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function ownBudget(
  ctx: { db: { get: (id: Id<"budgets">) => Promise<Doc<"budgets"> | null> } },
  userId: Id<"users">,
  budgetId: Id<"budgets">,
) {
  const doc = await ctx.db.get(budgetId);
  if (!doc || doc.userId !== userId) {
    throw new Error("Budget not found");
  }
  return doc;
}

export const list = query({
  args: {},
  returns: v.array(budgetRecord),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("budgets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt).map(toRecord);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    classLookup: optionalText,
    descriptionLookup: optionalText,
    amount: v.number(),
    warningThreshold: v.optional(v.number()),
    overageThreshold: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    cycle: v.optional(budgetCycle),
    startDate: v.optional(v.union(v.string(), v.null())),
    pingLinks: v.optional(v.array(pingLinkValidator)),
  },
  returns: budgetRecord,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const name = requiredText(args.name, "Name", MAX_NAME);
    const pingLinks = await sanitizePingLinks(ctx, user._id, args.pingLinks);
    const id = await ctx.db.insert("budgets", {
      userId: user._id,
      name,
      classLookup: optionalTrim(args.classLookup, MAX_LOOKUP),
      descriptionLookup: optionalTrim(args.descriptionLookup, MAX_LOOKUP),
      amount: requireAmount(args.amount),
      warningThreshold: requireThreshold(
        args.warningThreshold ?? 80,
        "Warning threshold",
      ),
      overageThreshold: requireThreshold(
        args.overageThreshold ?? 100,
        "Overage threshold",
      ),
      isActive: args.isActive !== false,
      cycle: requireCycle(args.cycle),
      startDate: requireStartDate(args.startDate),
      pingLinks,
      createdAt: now,
      updatedAt: now,
    });
    await syncLinkedPings(ctx, user._id, name, pingLinks);
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create budget");
    return toRecord(created);
  },
});

export const update = mutation({
  args: {
    budgetId: v.id("budgets"),
    name: v.optional(v.string()),
    classLookup: optionalText,
    descriptionLookup: optionalText,
    amount: v.optional(v.number()),
    warningThreshold: v.optional(v.number()),
    overageThreshold: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    cycle: v.optional(budgetCycle),
    startDate: v.optional(v.union(v.string(), v.null())),
    pingLinks: v.optional(v.array(pingLinkValidator)),
  },
  returns: budgetRecord,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ownBudget(ctx, user._id, args.budgetId);
    const patch: Partial<Doc<"budgets">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = requiredText(args.name, "Name", MAX_NAME);
    }
    if (args.classLookup !== undefined) {
      patch.classLookup = optionalTrim(args.classLookup, MAX_LOOKUP);
    }
    if (args.descriptionLookup !== undefined) {
      patch.descriptionLookup = optionalTrim(
        args.descriptionLookup,
        MAX_LOOKUP,
      );
    }
    if (args.amount !== undefined) {
      patch.amount = requireAmount(args.amount);
    }
    if (args.warningThreshold !== undefined) {
      patch.warningThreshold = requireThreshold(
        args.warningThreshold,
        "Warning threshold",
      );
    }
    if (args.overageThreshold !== undefined) {
      patch.overageThreshold = requireThreshold(
        args.overageThreshold,
        "Overage threshold",
      );
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.cycle !== undefined) patch.cycle = requireCycle(args.cycle);
    if (args.startDate !== undefined) {
      patch.startDate = requireStartDate(args.startDate);
    }
    if (args.pingLinks !== undefined) {
      patch.pingLinks = await sanitizePingLinks(ctx, user._id, args.pingLinks);
    }
    await ctx.db.patch(doc._id, patch);
    const next = await ctx.db.get(doc._id);
    if (!next) throw new Error("Budget not found");
    await syncLinkedPings(
      ctx,
      user._id,
      next.name,
      next.pingLinks ?? [],
    );
    return toRecord(next);
  },
});

export const remove = mutation({
  args: { budgetId: v.id("budgets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ownBudget(ctx, user._id, args.budgetId);
    await ctx.db.delete(doc._id);
    return null;
  },
});
