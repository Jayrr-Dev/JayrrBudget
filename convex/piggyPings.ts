import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const PING_TYPE_ORDER = ["Toast", "Email", "Popup", "Banner"] as const;
type PingType = (typeof PING_TYPE_ORDER)[number];

const pingTypeValidator = v.union(
  v.literal("Toast"),
  v.literal("Email"),
  v.literal("Popup"),
  v.literal("Banner"),
);

function normalizePingTypes(types: readonly string[]): PingType[] {
  const unique = PING_TYPE_ORDER.filter((type) => types.includes(type));
  const first = unique[0];
  if (!first) {
    throw new Error("Pick at least one ping type");
  }
  return [first, ...unique.slice(1)];
}

function primaryPingType(types: PingType[]): PingType {
  const first = types[0];
  if (!first) {
    throw new Error("Pick at least one ping type");
  }
  return first;
}

function typesFromDoc(doc: Doc<"piggyPings">): PingType[] {
  if (doc.pingTypes && doc.pingTypes.length > 0) {
    return normalizePingTypes(doc.pingTypes);
  }
  return [doc.pingType];
}

const pingRecord = v.object({
  id: v.id("piggyPings"),
  name: v.string(),
  title: v.string(),
  message: v.string(),
  pingType: pingTypeValidator,
  pingTypes: v.array(pingTypeValidator),
  cycle: v.string(),
  trigger: v.union(v.string(), v.null()),
  triggerCount: v.number(),
  isActive: v.boolean(),
  startDate: v.union(v.string(), v.null()),
  endDate: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  createdAt: v.number(),
  ownerLabel: v.string(),
});

const optionalText = v.optional(v.union(v.string(), v.null()));

const MAX_NAME = 80;
const MAX_TITLE = 160;
const MAX_MESSAGE = 2000;
const MAX_CYCLE = 80;
const MAX_NOTES = 2000;

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

function ownerLabel(user: Doc<"users">) {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return "You";
}

function toRecord(doc: Doc<"piggyPings">, owner: string) {
  const pingTypes = typesFromDoc(doc);
  return {
    id: doc._id,
    name: doc.name,
    title: doc.title,
    message: doc.message,
    pingType: primaryPingType(pingTypes),
    pingTypes,
    cycle: doc.cycle,
    trigger: doc.trigger,
    triggerCount: doc.triggerCount,
    isActive: doc.isActive !== false,
    startDate: doc.startDate,
    endDate: doc.endDate,
    notes: doc.notes,
    createdAt: doc.createdAt,
    ownerLabel: owner,
  };
}

async function ownPing(
  ctx: {
    db: { get: (id: Id<"piggyPings">) => Promise<Doc<"piggyPings"> | null> };
  },
  userId: Id<"users">,
  pingId: Id<"piggyPings">,
) {
  const doc = await ctx.db.get(pingId);
  if (!doc || doc.userId !== userId) {
    throw new Error("Ping not found");
  }
  return doc;
}

export const list = query({
  args: {},
  returns: v.array(pingRecord),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("piggyPings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const label = ownerLabel(user);
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((doc) => toRecord(doc, label));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    title: v.string(),
    message: v.string(),
    pingType: v.optional(pingTypeValidator),
    pingTypes: v.optional(v.array(pingTypeValidator)),
    cycle: v.string(),
    trigger: optionalText,
    startDate: optionalText,
    endDate: optionalText,
    notes: optionalText,
    isActive: v.optional(v.boolean()),
  },
  returns: pingRecord,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const fromList = args.pingTypes ?? [];
    const pingTypes = normalizePingTypes(
      fromList.length > 0 ? fromList : args.pingType ? [args.pingType] : [],
    );
    const id = await ctx.db.insert("piggyPings", {
      userId: user._id,
      name: requiredText(args.name, "Name", MAX_NAME),
      title: requiredText(args.title, "Title", MAX_TITLE),
      message: requiredText(args.message, "Message", MAX_MESSAGE),
      pingType: primaryPingType(pingTypes),
      pingTypes,
      cycle: requiredText(args.cycle, "Cycle", MAX_CYCLE),
      trigger: optionalTrim(args.trigger, MAX_CYCLE),
      triggerCount: 0,
      isActive: args.isActive !== false,
      startDate: optionalTrim(args.startDate, 32),
      endDate: optionalTrim(args.endDate, 32),
      notes: optionalTrim(args.notes, MAX_NOTES),
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create ping");
    return toRecord(created, ownerLabel(user));
  },
});

export const update = mutation({
  args: {
    pingId: v.id("piggyPings"),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    message: v.optional(v.string()),
    pingType: v.optional(pingTypeValidator),
    pingTypes: v.optional(v.array(pingTypeValidator)),
    cycle: v.optional(v.string()),
    trigger: optionalText,
    startDate: optionalText,
    endDate: optionalText,
    notes: optionalText,
    isActive: v.optional(v.boolean()),
  },
  returns: pingRecord,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ownPing(ctx, user._id, args.pingId);
    const patch: Partial<Doc<"piggyPings">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = requiredText(args.name, "Name", MAX_NAME);
    }
    if (args.title !== undefined) {
      patch.title = requiredText(args.title, "Title", MAX_TITLE);
    }
    if (args.message !== undefined) {
      patch.message = requiredText(args.message, "Message", MAX_MESSAGE);
    }
    if (args.pingTypes !== undefined) {
      const pingTypes = normalizePingTypes(args.pingTypes);
      patch.pingTypes = pingTypes;
      patch.pingType = primaryPingType(pingTypes);
    } else if (args.pingType !== undefined) {
      const pingTypes = normalizePingTypes([args.pingType]);
      patch.pingTypes = pingTypes;
      patch.pingType = primaryPingType(pingTypes);
    }
    if (args.cycle !== undefined) {
      patch.cycle = requiredText(args.cycle, "Cycle", MAX_CYCLE);
    }
    if (args.trigger !== undefined) {
      patch.trigger = optionalTrim(args.trigger, MAX_CYCLE);
    }
    if (args.startDate !== undefined) {
      patch.startDate = optionalTrim(args.startDate, 32);
    }
    if (args.endDate !== undefined) {
      patch.endDate = optionalTrim(args.endDate, 32);
    }
    if (args.notes !== undefined) {
      patch.notes = optionalTrim(args.notes, MAX_NOTES);
    }
    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
    }
    await ctx.db.patch(doc._id, patch);
    const next = await ctx.db.get(doc._id);
    if (!next) throw new Error("Ping not found");
    return toRecord(next, ownerLabel(user));
  },
});

export const remove = mutation({
  args: { pingId: v.id("piggyPings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ownPing(ctx, user._id, args.pingId);
    await ctx.db.delete(doc._id);
    return null;
  },
});
