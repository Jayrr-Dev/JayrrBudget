import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser, userRole } from "./lib/auth";

const statusValidator = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

const sourceValidator = v.union(
  v.literal("error_boundary"),
  v.literal("manual"),
);

function toRecord(doc: Doc<"issues">, reporterEmail?: string | null) {
  return {
    id: doc._id,
    message: doc.message,
    stack: doc.stack,
    componentStack: doc.componentStack,
    url: doc.url,
    userNote: doc.userNote,
    status: doc.status,
    source: doc.source,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    reporterEmail: reporterEmail ?? null,
  };
}

export const create = mutation({
  args: {
    message: v.string(),
    stack: v.optional(v.union(v.string(), v.null())),
    componentStack: v.optional(v.union(v.string(), v.null())),
    url: v.optional(v.union(v.string(), v.null())),
    userNote: v.optional(v.union(v.string(), v.null())),
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const message = args.message.trim();
    if (!message) {
      throw new Error("Error message is required");
    }
    const now = Date.now();
    const id = await ctx.db.insert("issues", {
      userId: user._id,
      message: message.slice(0, 4000),
      stack: args.stack?.slice(0, 16_000) ?? null,
      componentStack: args.componentStack?.slice(0, 16_000) ?? null,
      url: args.url?.slice(0, 2000) ?? null,
      userNote: args.userNote?.trim().slice(0, 2000) || null,
      status: "open",
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create issue");
    return toRecord(created);
  },
});

/** Own issues for normal users; all issues for admin. */
export const list = query({
  args: {
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const role = userRole(user);

    if (role === "admin") {
      const rows = args.status
        ? await ctx.db
            .query("issues")
            .withIndex("by_status", (q) => q.eq("status", args.status!))
            .collect()
        : await ctx.db.query("issues").collect();

      const enriched = await Promise.all(
        rows.map(async (doc) => {
          const reporter = doc.userId ? await ctx.db.get(doc.userId) : null;
          return toRecord(doc, reporter?.email ?? reporter?.name ?? null);
        }),
      );
      return enriched.sort((a, b) => b.createdAt - a.createdAt);
    }

    const rows = await ctx.db
      .query("issues")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const filtered = args.status
      ? rows.filter((r) => r.status === args.status)
      : rows;
    return filtered
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((doc) => toRecord(doc));
  },
});

export const updateStatus = mutation({
  args: {
    issueId: v.id("issues"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.issueId);
    if (!doc) throw new Error("Issue not found");

    const role = userRole(user);
    const isOwner = doc.userId === user._id;
    if (!isOwner && role !== "admin") {
      throw new Error("Issue not found");
    }

    await ctx.db.patch(doc._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.issueId);
    if (!doc) throw new Error("Issue not found");

    const role = userRole(user);
    const isOwner = doc.userId === user._id;
    if (!isOwner && role !== "admin") {
      throw new Error("Issue not found");
    }

    await ctx.db.delete(doc._id);
  },
});
