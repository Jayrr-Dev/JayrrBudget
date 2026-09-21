import {
  createAccount,
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { action, internalQuery, query } from "./_generated/server";

const MIN_PASSWORD_LENGTH = 8;

type PasswordGate = {
  userId: Id<"users">;
  email: string | null;
  name: string | null;
  hasGoogle: boolean;
  hasPassword: boolean;
};

async function loadPasswordGate(ctx: QueryCtx): Promise<PasswordGate | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;

  const google = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "google"),
    )
    .first();
  const password = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "password"),
    )
    .first();

  return {
    userId,
    email: user.email?.trim().toLowerCase() ?? null,
    name: user.name ?? null,
    hasGoogle: google !== null,
    hasPassword: password !== null,
  };
}

/** True when this Google account still has no password. */
export const needsPasswordSetup = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const gate = await loadPasswordGate(ctx);
    if (!gate) return false;
    if (!gate.hasGoogle) return false;
    return !gate.hasPassword;
  },
});

export const loadForPasswordSetup = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      email: v.string(),
      name: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const gate = await loadPasswordGate(ctx);
    if (!gate) return null;
    if (!gate.hasGoogle) return null;
    if (gate.hasPassword) return null;
    if (!gate.email) return null;
    return {
      userId: gate.userId,
      email: gate.email,
      name: gate.name,
    };
  },
});

/** True when this account can sign in with a password. */
export const hasPassword = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const gate = await loadPasswordGate(ctx);
    if (!gate) return false;
    return gate.hasPassword;
  },
});

export const loadForPasswordChange = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      email: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const gate = await loadPasswordGate(ctx);
    if (!gate?.hasPassword || !gate.email) return null;
    return { userId: gate.userId, email: gate.email };
  },
});

/**
 * Replace the sign-in password after the current one checks out.
 * Does not touch ledger ciphertext. The client re-wraps the same vault key.
 */
export const changePassword = action({
  args: {
    oldPassword: v.string(),
    newPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (args.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    if (args.oldPassword === args.newPassword) {
      throw new Error("Choose a different password");
    }

    const gate = await ctx.runQuery(
      internal.passwordSetup.loadForPasswordChange,
      {},
    );
    if (!gate || gate.userId !== userId) {
      throw new Error("This account has no password to change");
    }

    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: gate.email, secret: args.oldPassword },
      });
    } catch {
      throw new Error("Current password is wrong");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: gate.email, secret: args.newPassword },
    });

    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, {
      userId,
      except: sessionId ? [sessionId] : [],
    });
    return null;
  },
});

/** Attach a password to the signed-in Google account. Does not create a second user. */
export const setInitialPassword = action({
  args: { password: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    if (args.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("Password must be at least 8 characters");
    }

    const gate = await ctx.runQuery(
      internal.passwordSetup.loadForPasswordSetup,
      {},
    );
    if (!gate) {
      throw new Error(
        "This Google account already has a password, or email is missing",
      );
    }
    if (gate.userId !== userId) {
      throw new Error("Not authenticated");
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: gate.email, secret: args.password },
      profile: {
        email: gate.email,
        name: gate.name ?? undefined,
      },
    });
    if (created.user._id !== userId) {
      throw new Error("Could not attach the password to this Google account");
    }
    return null;
  },
});
