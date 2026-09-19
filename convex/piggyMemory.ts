import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Piggy's memory. One row per signed-in user.
 * Every function resolves the owner from the auth token, never from the client.
 */

const MAX_ITEMS_PER_LIST = 20;
const MAX_ITEM_LENGTH = 240;
const MAX_NICKNAME_LENGTH = 24;
const MAX_SUMMARY_LENGTH = 800;

const scopeValidator = v.union(v.literal("ledger"), v.literal("canvas"));

const listFieldValidator = v.union(
  v.literal("basicInfo"),
  v.literal("goals"),
  v.literal("painPoints"),
  v.literal("preferences"),
  v.literal("wins"),
  v.literal("followUps"),
);

const memoryReturn = v.object({
  nickname: v.union(v.string(), v.null()),
  basicInfo: v.array(v.string()),
  goals: v.array(v.string()),
  painPoints: v.array(v.string()),
  preferences: v.array(v.string()),
  wins: v.array(v.string()),
  followUps: v.array(v.string()),
  lastSessionSummary: v.union(v.string(), v.null()),
  lastSessionAt: v.union(v.number(), v.null()),
  lastSessionScope: v.union(scopeValidator, v.null()),
  sessionCount: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

type ListField =
  | "basicInfo"
  | "goals"
  | "painPoints"
  | "preferences"
  | "wins"
  | "followUps";

const LIST_FIELDS: ListField[] = [
  "basicInfo",
  "goals",
  "painPoints",
  "preferences",
  "wins",
  "followUps",
];

function sanitizeText(raw: string, max: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<<+|>>+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeList(raw: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const clipped = sanitizeText(entry, MAX_ITEM_LENGTH);
    if (!clipped) continue;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(clipped);
  }
  // Keep the newest entries when the list overflows.
  return cleaned.slice(-MAX_ITEMS_PER_LIST);
}

function emptyMemory() {
  return {
    nickname: null,
    basicInfo: [],
    goals: [],
    painPoints: [],
    preferences: [],
    wins: [],
    followUps: [],
    lastSessionSummary: null,
    lastSessionAt: null,
    lastSessionScope: null,
    sessionCount: 0,
    updatedAt: null,
  };
}

function toRecord(doc: Doc<"piggyMemory">) {
  return {
    nickname: doc.nickname,
    basicInfo: doc.basicInfo,
    goals: doc.goals,
    painPoints: doc.painPoints,
    preferences: doc.preferences,
    wins: doc.wins,
    followUps: doc.followUps,
    lastSessionSummary: doc.lastSessionSummary,
    lastSessionAt: doc.lastSessionAt,
    lastSessionScope: doc.lastSessionScope,
    sessionCount: doc.sessionCount,
    updatedAt: doc.updatedAt,
  };
}

async function getOwnedDoc(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"piggyMemory"> | null> {
  const doc = await ctx.db
    .query("piggyMemory")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (doc && doc.userId !== userId) {
    throw new Error("Unauthorized");
  }
  return doc;
}

async function getOrCreateOwnedDoc(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"piggyMemory">> {
  const existing = await getOwnedDoc(ctx, userId);
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("piggyMemory", {
    userId,
    nickname: null,
    basicInfo: [],
    goals: [],
    painPoints: [],
    preferences: [],
    wins: [],
    followUps: [],
    lastSessionSummary: null,
    lastSessionAt: null,
    lastSessionScope: null,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create Jev memory");
  return created;
}

/** Signed-in user's Piggy memory. Empty shape when Piggy has not learned anything yet. */
export const get = query({
  args: {},
  returns: memoryReturn,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await getOwnedDoc(ctx, user._id);
    return doc ? toRecord(doc) : emptyMemory();
  },
});

/**
 * Add facts to one or more memory lists. Dedupes and clips.
 * Optional nickname replaces the stored one; empty string clears it.
 */
export const remember = mutation({
  args: {
    nickname: v.optional(v.string()),
    basicInfo: v.optional(v.array(v.string())),
    goals: v.optional(v.array(v.string())),
    painPoints: v.optional(v.array(v.string())),
    preferences: v.optional(v.array(v.string())),
    wins: v.optional(v.array(v.string())),
    followUps: v.optional(v.array(v.string())),
    lastSessionSummary: v.optional(v.string()),
  },
  returns: memoryReturn,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreateOwnedDoc(ctx, user._id);
    const patch: Partial<Doc<"piggyMemory">> = { updatedAt: Date.now() };

    for (const field of LIST_FIELDS) {
      const additions = args[field];
      if (!additions) continue;
      patch[field] = normalizeList([...doc[field], ...additions]);
    }
    if (args.nickname !== undefined) {
      const nickname = sanitizeText(args.nickname, MAX_NICKNAME_LENGTH);
      patch.nickname = nickname || null;
    }
    if (args.lastSessionSummary !== undefined) {
      const summary = sanitizeText(args.lastSessionSummary, MAX_SUMMARY_LENGTH);
      patch.lastSessionSummary = summary || null;
    }

    await ctx.db.patch(doc._id, patch);
    return toRecord({ ...doc, ...patch });
  },
});

/** Remove entries from one list (exact, case-insensitive match). */
export const forget = mutation({
  args: {
    field: listFieldValidator,
    entries: v.array(v.string()),
  },
  returns: memoryReturn,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreateOwnedDoc(ctx, user._id);
    const drop = new Set(
      args.entries.map((entry) => sanitizeText(entry, MAX_ITEM_LENGTH).toLowerCase()),
    );
    const next = doc[args.field].filter(
      (entry) => !drop.has(entry.toLowerCase()),
    );
    const patch = { [args.field]: next, updatedAt: Date.now() } as const;
    await ctx.db.patch(doc._id, patch);
    return toRecord({ ...doc, ...patch });
  },
});

/** Stamp a chat session: bumps count, records time and which Piggy the user talked to. */
export const recordSession = mutation({
  args: {
    scope: scopeValidator,
    summary: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreateOwnedDoc(ctx, user._id);
    const now = Date.now();
    const patch: Partial<Doc<"piggyMemory">> = {
      lastSessionAt: now,
      lastSessionScope: args.scope,
      sessionCount: doc.sessionCount + 1,
      updatedAt: now,
    };
    if (args.summary !== undefined) {
      const summary = sanitizeText(args.summary, MAX_SUMMARY_LENGTH);
      if (summary) patch.lastSessionSummary = summary;
    }
    await ctx.db.patch(doc._id, patch);
    return null;
  },
});

/** Wipe the signed-in user's Piggy memory. */
export const clear = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await getOwnedDoc(ctx, user._id);
    if (doc) await ctx.db.delete(doc._id);
    return null;
  },
});
