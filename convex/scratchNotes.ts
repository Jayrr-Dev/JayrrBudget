import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";

const rowValidator = v.object({
  id: v.string(),
  name: v.string(),
  spend: v.number(),
  count: v.number(),
  currency: v.string(),
  parent: v.optional(v.string()),
});

const tabValidator = v.object({
  id: v.string(),
  name: v.string(),
  rows: v.array(rowValidator),
});

type NoteRow = {
  id: string;
  name: string;
  spend: number;
  count: number;
  currency: string;
  parent?: string;
};

type NoteTab = {
  id: string;
  name: string;
  rows: NoteRow[];
};

type NoteState = {
  tabs: NoteTab[];
  activeId: string;
  receiveId: string;
};

function newId(prefix = "n") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyState(): NoteState {
  const id = "tab-1";
  return {
    tabs: [{ id, name: "Sheet 1", rows: [] }],
    activeId: id,
    receiveId: id,
  };
}

function toState(doc: Doc<"scratchNotes">): NoteState {
  return {
    tabs: doc.tabs,
    activeId: doc.activeId,
    receiveId: doc.receiveId,
  };
}

async function getDoc(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"scratchNotes"> | null> {
  return ctx.db
    .query("scratchNotes")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

async function getOrCreate(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"scratchNotes">> {
  const existing = await getDoc(ctx, userId);
  if (existing) return existing;
  const seed = emptyState();
  const id = await ctx.db.insert("scratchNotes", {
    userId,
    ...seed,
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create scratch note");
  return created;
}

async function writeState(
  ctx: MutationCtx,
  doc: Doc<"scratchNotes">,
  next: NoteState,
) {
  await ctx.db.patch(doc._id, {
    tabs: next.tabs,
    activeId: next.activeId,
    receiveId: next.receiveId,
    updatedAt: Date.now(),
  });
  return next;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db
      .query("scratchNotes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    return doc ? toState(doc) : emptyState();
  },
});

/** One-shot import of localStorage notes when Convex pad has no rows yet. */
export const importIfEmpty = mutation({
  args: {
    tabs: v.array(tabValidator),
    activeId: v.string(),
    receiveId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await getDoc(ctx, user._id);
    if (!args.tabs.length) {
      return existing ? toState(existing) : emptyState();
    }

    const localHasRows = args.tabs.some((t) => t.rows.length > 0);
    const existingHasRows = Boolean(
      existing?.tabs.some((t) => t.rows.length > 0),
    );
    if (existing && (existingHasRows || !localHasRows)) {
      return toState(existing);
    }

    const tabs = args.tabs;
    const activeId = tabs.some((t) => t.id === args.activeId)
      ? args.activeId
      : tabs[0]!.id;
    const receiveId = tabs.some((t) => t.id === args.receiveId)
      ? args.receiveId
      : activeId;
    const next = { tabs, activeId, receiveId, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, next);
    } else {
      await ctx.db.insert("scratchNotes", {
        userId: user._id,
        ...next,
      });
    }
    return { tabs, activeId, receiveId };
  },
});

export const addRow = mutation({
  args: {
    name: v.string(),
    spend: v.number(),
    count: v.number(),
    currency: v.string(),
    parent: v.optional(v.string()),
    id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    const receiveId = state.receiveId;
    const tab = state.tabs.find((t) => t.id === receiveId);
    if (!tab) return state;

    const existing = tab.rows.find(
      (row) =>
        row.name === args.name &&
        (row.parent ?? "") === (args.parent ?? "") &&
        row.currency === args.currency,
    );

    const nextRows = existing
      ? tab.rows.map((row) =>
          row.id === existing.id
            ? { ...row, spend: args.spend, count: args.count }
            : row,
        )
      : [
          ...tab.rows,
          {
            id: args.id ?? newId("row"),
            name: args.name,
            spend: args.spend,
            count: args.count,
            currency: args.currency,
            parent: args.parent,
          },
        ];

    return writeState(ctx, doc, {
      ...state,
      activeId: receiveId,
      tabs: state.tabs.map((t) =>
        t.id === receiveId ? { ...t, rows: nextRows } : t,
      ),
    });
  },
});

export const removeRow = mutation({
  args: { rowId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    return writeState(ctx, doc, {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeId
          ? { ...tab, rows: tab.rows.filter((row) => row.id !== args.rowId) }
          : tab,
      ),
    });
  },
});

export const clearActive = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    return writeState(ctx, doc, {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeId ? { ...tab, rows: [] } : tab,
      ),
    });
  },
});

export const selectTab = mutation({
  args: { tabId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    if (!state.tabs.some((t) => t.id === args.tabId)) return state;
    return writeState(ctx, doc, { ...state, activeId: args.tabId });
  },
});

export const setReceiveTab = mutation({
  args: { tabId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    if (!state.tabs.some((t) => t.id === args.tabId)) return state;
    return writeState(ctx, doc, { ...state, receiveId: args.tabId });
  },
});

export const addTab = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    const id = newId("tab");
    const name = `Sheet ${state.tabs.length + 1}`;
    return writeState(ctx, doc, {
      tabs: [...state.tabs, { id, name, rows: [] }],
      activeId: id,
      receiveId: state.receiveId,
    });
  },
});

export const closeTab = mutation({
  args: { tabId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    if (state.tabs.length <= 1) return state;
    const tabs = state.tabs.filter((t) => t.id !== args.tabId);
    const activeId =
      state.activeId === args.tabId
        ? (tabs[0]?.id ?? state.activeId)
        : state.activeId;
    const receiveId =
      state.receiveId === args.tabId ? activeId : state.receiveId;
    return writeState(ctx, doc, { tabs, activeId, receiveId });
  },
});

export const renameTab = mutation({
  args: { tabId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await getOrCreate(ctx, user._id);
    const state = toState(doc);
    const trimmed = args.name.trim();
    if (!trimmed) return state;
    return writeState(ctx, doc, {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === args.tabId ? { ...tab, name: trimmed } : tab,
      ),
    });
  },
});
