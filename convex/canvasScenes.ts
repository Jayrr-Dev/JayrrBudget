import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** Stay under Convex's ~1 MiB document limit with headroom for metadata. */
const MAX_SCENE_JSON_CHARS = 900_000;

const sceneStateValidator = v.union(
  v.object({
    sceneJson: v.string(),
    updatedAt: v.number(),
  }),
  v.null(),
);

function assertSceneSize(sceneJson: string) {
  if (sceneJson.length > MAX_SCENE_JSON_CHARS) {
    throw new Error(
      `Canvas scene is too large to save (${sceneJson.length} chars; max ${MAX_SCENE_JSON_CHARS}). Remove large images and try again.`,
    );
  }
}

function toState(doc: Doc<"canvasScenes">) {
  return {
    sceneJson: doc.sceneJson,
    updatedAt: doc.updatedAt,
  };
}

async function getDoc(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"canvasScenes"> | null> {
  return ctx.db
    .query("canvasScenes")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

function sceneHasContent(sceneJson: string): boolean {
  try {
    const data: unknown = JSON.parse(sceneJson);
    if (!data || typeof data !== "object") return false;
    const elements = (data as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) return false;
    return elements.some((el) => {
      if (!el || typeof el !== "object") return false;
      return (el as { isDeleted?: boolean }).isDeleted !== true;
    });
  } catch {
    return false;
  }
}

export const get = query({
  args: {},
  returns: sceneStateValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db
      .query("canvasScenes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    return doc ? toState(doc) : null;
  },
});

/** Debounced client save of the full Excalidraw serializeAsJSON payload. */
export const upsert = mutation({
  args: { sceneJson: v.string() },
  returns: sceneStateValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertSceneSize(args.sceneJson);
    const existing = await getDoc(ctx, user._id);
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sceneJson: args.sceneJson,
        updatedAt,
      });
      return { sceneJson: args.sceneJson, updatedAt };
    }
    await ctx.db.insert("canvasScenes", {
      userId: user._id,
      sceneJson: args.sceneJson,
      updatedAt,
    });
    return { sceneJson: args.sceneJson, updatedAt };
  },
});

/** One-shot localStorage → Convex when the cloud scene is still empty. */
export const importIfEmpty = mutation({
  args: { sceneJson: v.string() },
  returns: sceneStateValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertSceneSize(args.sceneJson);
    const existing = await getDoc(ctx, user._id);
    const localHasContent = sceneHasContent(args.sceneJson);
    const existingHasContent = existing
      ? sceneHasContent(existing.sceneJson)
      : false;

    if (existing && (existingHasContent || !localHasContent)) {
      return toState(existing);
    }
    if (!localHasContent) {
      return existing ? toState(existing) : null;
    }

    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sceneJson: args.sceneJson,
        updatedAt,
      });
    } else {
      await ctx.db.insert("canvasScenes", {
        userId: user._id,
        sceneJson: args.sceneJson,
        updatedAt,
      });
    }
    return { sceneJson: args.sceneJson, updatedAt };
  },
});
