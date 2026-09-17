import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";

const MAX_HELPERS = 2;
const MAX_CHAT_ID = 80;
const MAX_NAME = 32;
const MAX_BRIEF = 400;
const MAX_BODY = 4000;
const MAX_MAIL_KEEP = 80;

const slotValidator = v.union(v.literal("1"), v.literal("2"));
const piggySlotValidator = v.union(
  v.literal("lead"),
  v.literal("1"),
  v.literal("2"),
);

const helperReturn = v.object({
  slot: slotValidator,
  name: v.string(),
  brief: v.string(),
  createdAt: v.number(),
});

const mailReturn = v.object({
  fromSlot: piggySlotValidator,
  toSlot: piggySlotValidator,
  body: v.string(),
  createdAt: v.number(),
});

function sanitizeText(raw: string, max: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<<+|>>+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clipChatId(raw: string): string {
  const clipped = sanitizeText(raw, MAX_CHAT_ID);
  return clipped || "default";
}

async function ownedRows(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  chatId: string,
) {
  const rows = await ctx.db
    .query("piggyCrew")
    .withIndex("by_userId_chatId", (q) =>
      q.eq("userId", userId).eq("chatId", chatId),
    )
    .collect();
  return rows.filter((row) => row.userId === userId);
}

function helpersOf(rows: Doc<"piggyCrew">[]) {
  return rows
    .filter((row) => row.kind === "helper" && (row.slot === "1" || row.slot === "2"))
    .map((row) => ({
      slot: row.slot as "1" | "2",
      name: row.name ?? "Helper",
      brief: row.brief ?? "",
      createdAt: row.createdAt,
    }))
    .sort((a, b) => a.slot.localeCompare(b.slot));
}

function mailOf(rows: Doc<"piggyCrew">[]) {
  return rows
    .filter(
      (row) =>
        row.kind === "mail" &&
        row.fromSlot &&
        row.toSlot &&
        typeof row.body === "string",
    )
    .map((row) => ({
      fromSlot: row.fromSlot as "lead" | "1" | "2",
      toSlot: row.toSlot as "lead" | "1" | "2",
      body: row.body as string,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function pruneMail(
  ctx: MutationCtx,
  userId: Id<"users">,
  chatId: string,
) {
  const rows = await ctx.db
    .query("piggyCrew")
    .withIndex("by_userId_chatId_kind", (q) =>
      q.eq("userId", userId).eq("chatId", chatId).eq("kind", "mail"),
    )
    .collect();
  const owned = rows.filter((row) => row.userId === userId);
  if (owned.length <= MAX_MAIL_KEEP) return;
  owned.sort((a, b) => a.createdAt - b.createdAt);
  const extra = owned.slice(0, owned.length - MAX_MAIL_KEEP);
  for (const row of extra) {
    await ctx.db.delete(row._id);
  }
}

export const list = query({
  args: { chatId: v.string() },
  returns: v.object({
    helpers: v.array(helperReturn),
    mail: v.array(mailReturn),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const chatId = clipChatId(args.chatId);
    const rows = await ownedRows(ctx, user._id, chatId);
    return { helpers: helpersOf(rows), mail: mailOf(rows).slice(-40) };
  },
});

export const hire = mutation({
  args: {
    chatId: v.string(),
    name: v.string(),
    brief: v.string(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      slot: slotValidator,
      name: v.string(),
      brief: v.string(),
    }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const chatId = clipChatId(args.chatId);
    const name = sanitizeText(args.name, MAX_NAME);
    const brief = sanitizeText(args.brief, MAX_BRIEF);
    if (!name) {
      return { ok: false as const, error: "Give the helper a short name." };
    }
    if (!brief) {
      return { ok: false as const, error: "Say what this helper should do." };
    }
    const rows = await ownedRows(ctx, user._id, chatId);
    const helpers = helpersOf(rows);
    if (helpers.length >= MAX_HELPERS) {
      return {
        ok: false as const,
        error: "Piggy already has two helpers on this chat.",
      };
    }
    const used = new Set(helpers.map((row) => row.slot));
    const slot: "1" | "2" = used.has("1") ? "2" : "1";
    const createdAt = Date.now();
    await ctx.db.insert("piggyCrew", {
      userId: user._id,
      chatId,
      kind: "helper",
      slot,
      name,
      brief,
      createdAt,
    });
    return { ok: true as const, slot, name, brief };
  },
});

export const dismiss = mutation({
  args: { chatId: v.string(), slot: slotValidator },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const chatId = clipChatId(args.chatId);
    const rows = await ownedRows(ctx, user._id, chatId);
    const helper = rows.find(
      (row) => row.kind === "helper" && row.slot === args.slot,
    );
    if (!helper || helper.userId !== user._id) {
      return { ok: false };
    }
    await ctx.db.delete(helper._id);
    return { ok: true };
  },
});

export const post = mutation({
  args: {
    chatId: v.string(),
    fromSlot: piggySlotValidator,
    toSlot: piggySlotValidator,
    body: v.string(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), createdAt: v.number() }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const chatId = clipChatId(args.chatId);
    const body = sanitizeText(args.body, MAX_BODY);
    if (!body) {
      return { ok: false as const, error: "Empty message." };
    }
    if (args.fromSlot !== "lead") {
      const helpers = helpersOf(await ownedRows(ctx, user._id, chatId));
      if (!helpers.some((row) => row.slot === args.fromSlot)) {
        return { ok: false as const, error: "That helper is not hired." };
      }
    }
    if (args.toSlot !== "lead") {
      const helpers = helpersOf(await ownedRows(ctx, user._id, chatId));
      if (!helpers.some((row) => row.slot === args.toSlot)) {
        return { ok: false as const, error: "That helper is not hired." };
      }
    }
    const createdAt = Date.now();
    await ctx.db.insert("piggyCrew", {
      userId: user._id,
      chatId,
      kind: "mail",
      fromSlot: args.fromSlot,
      toSlot: args.toSlot,
      body,
      createdAt,
    });
    await pruneMail(ctx, user._id, chatId);
    return { ok: true as const, createdAt };
  },
});
