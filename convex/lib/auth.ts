import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  DEFAULT_USER_ROLE,
  isUserRole,
  roleAtLeast,
  type UserRole,
} from "./roles";

type AuthCtx = QueryCtx | MutationCtx;

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

/** Require a signed-in Convex Auth user id. Never trust client-supplied ids. */
export async function requireAuthUserId(ctx: AuthCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new AuthError("Not authenticated");
  }
  return userId;
}

export function userRole(user: Doc<"users">): UserRole {
  return isUserRole(user.role) ? user.role : DEFAULT_USER_ROLE;
}

/** Load the users row for the signed-in identity. */
export async function requireUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const userId = await requireAuthUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new AuthError("User profile missing");
  }
  return user;
}

/** Alias for mutations that previously created a profile (Auth creates users). */
export async function ensureUser(ctx: MutationCtx): Promise<Doc<"users">> {
  return requireUser(ctx);
}

/** Require the signed-in user to have at least `minimum` role. */
export async function requireRole(
  ctx: AuthCtx,
  minimum: UserRole,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  const role = userRole(user);
  if (!roleAtLeast(role, minimum)) {
    throw new AuthError(
      minimum === "admin"
        ? "Admin access required"
        : minimum === "premium"
          ? "Premium access required"
          : "Not allowed",
    );
  }
  return user;
}

export type OwnedUserId = Id<"users">;
