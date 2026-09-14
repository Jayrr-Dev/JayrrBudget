import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";

const DEFAULT_TAB_NAME = "Note";

function newTabId() {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toRecord(doc: Doc<"userNotes">) {
  return {
    id: doc._id,
    tabId: doc.tabId,
    tabName: doc.tabName,
    content: doc.content,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listOwned(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userNotes">[]> {
  const rows = await ctx.db
    .query("userNotes")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("userNotes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toRecord);
  },
});

export const insertDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await listOwned(ctx, user._id);
    if (existing.length > 0) return toRecord(existing[0]!);
    const now = Date.now();
    const id = await ctx.db.insert("userNotes", {
      userId: user._id,
      tabId: newTabId(),
      tabName: DEFAULT_TAB_NAME,
      content: "",
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create note");
    return toRecord(created);
  },
});

export const insertTab = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await listOwned(ctx, user._id);
    const now = Date.now();
    const name = `${DEFAULT_TAB_NAME} ${existing.length + 1}`;
    const id = await ctx.db.insert("userNotes", {
      userId: user._id,
      tabId: newTabId(),
      tabName: name,
      content: "",
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create note tab");
    return toRecord(created);
  },
});

export const updateContent = mutation({
  args: {
    noteId: v.id("userNotes"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.noteId);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Note not found");
    }
    await ctx.db.patch(doc._id, {
      content: args.content,
      updatedAt: Date.now(),
    });
  },
});

export const renameTab = mutation({
  args: {
    noteId: v.id("userNotes"),
    tabName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.noteId);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Note not found");
    }
    const trimmed = args.tabName.trim();
    if (!trimmed) return toRecord(doc);
    await ctx.db.patch(doc._id, {
      tabName: trimmed,
      updatedAt: Date.now(),
    });
    return { ...toRecord(doc), tabName: trimmed };
  },
});

export const removeTab = mutation({
  args: { noteId: v.id("userNotes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.noteId);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Note not found");
    }
    const siblings = await listOwned(ctx, user._id);
    if (siblings.length <= 1) {
      await ctx.db.patch(doc._id, {
        content: "",
        tabName: DEFAULT_TAB_NAME,
        updatedAt: Date.now(),
      });
      return;
    }
    await ctx.db.delete(doc._id);
  },
});
