import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

/** Require a verified Clerk identity (JWT). Never trust client-supplied user ids. */
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new AuthError("Not authenticated");
  }
  return identity;
}

async function findUserByIdentity(ctx: AuthCtx, tokenIdentifier: string) {
  return ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();
}

/** Load the users row; throws if missing (call users.ensure after sign-in). */
export async function requireUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const existing = await findUserByIdentity(ctx, identity.tokenIdentifier);
  if (!existing) {
    throw new AuthError("User profile missing — call users.ensure after sign-in");
  }
  return existing;
}

/** Get or create the users row (mutations only). */
export async function ensureUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const existing = await findUserByIdentity(ctx, identity.tokenIdentifier);
  if (existing) return existing;

  // Link one-time bootstrap owner (e.g. "Jayrr") on first Clerk sign-in.
  const allUsers = await ctx.db.query("users").collect();
  const bootstrap = allUsers.find((u) =>
    u.tokenIdentifier.startsWith("bootstrap:"),
  );
  if (bootstrap && allUsers.length === 1) {
    const subject = identity.subject ?? identity.tokenIdentifier;
    await ctx.db.patch(bootstrap._id, {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: subject,
      email: identity.email ?? bootstrap.email,
      name: identity.name ?? bootstrap.name,
    });
    const linked = await ctx.db.get(bootstrap._id);
    if (!linked) throw new AuthError("Failed to link bootstrap user");
    return linked;
  }

  const subject = identity.subject ?? identity.tokenIdentifier;
  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    clerkUserId: subject,
    email: identity.email ?? null,
    name: identity.name ?? null,
    createdAt: Date.now(),
  });
  const created = await ctx.db.get(userId);
  if (!created) throw new AuthError("Failed to create user profile");
  return created;
}

export type OwnedUserId = Id<"users">;
