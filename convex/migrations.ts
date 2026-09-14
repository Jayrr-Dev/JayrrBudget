import { v } from "convex/values";
import {
  createAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireRole, requireUser } from "./lib/auth";
import { ensureModulesForUser } from "./lib/ensureModules";
import type { Id } from "./_generated/dataModel";

const LEDGER_TABLES = [
  "institutions",
  "accounts",
  "loanTerms",
  "loanPaymentLinks",
  "statementUploads",
  "transactionSections",
  "transactionSpreads",
  "transactionCategories",
  "transactionSubcategories",
  "transactionTypes",
  "transactionKinds",
  "transactions",
  "appModules",
] as const;

type DbCtx = { db: any };

async function claimUnownedToUser(
  ctx: DbCtx,
  userId: Id<"users">,
): Promise<Record<string, number>> {
  const patched: Record<string, number> = {};
  for (const table of LEDGER_TABLES) {
    const rows = await ctx.db.query(table).collect();
    let count = 0;
    for (const row of rows) {
      if (row.userId) continue;
      await ctx.db.patch(row._id, { userId });
      count += 1;
    }
    patched[table] = count;
  }
  return patched;
}

async function reassignForeignLedgersToUser(
  ctx: DbCtx,
  userId: Id<"users">,
): Promise<Record<string, number>> {
  const patched: Record<string, number> = {};
  for (const table of LEDGER_TABLES) {
    const rows = await ctx.db.query(table).collect();
    let count = 0;
    for (const row of rows) {
      if (row.userId === userId) continue;
      await ctx.db.patch(row._id, { userId });
      count += 1;
    }
    patched[table] = count;
  }
  return patched;
}

/**
 * One-time backfill: claim pre-auth import rows that have no userId.
 */
export const claimUnownedData = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const patched = await claimUnownedToUser(ctx, user._id);
    return { userId: user._id, patched };
  },
});

/**
 * Admin-only cutover: point every ledger row at the signed-in admin.
 * Normal logins must never call this — it steals other users' data.
 */
export const reassignAllLedgersToCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "admin");
    const unowned = await claimUnownedToUser(ctx, user._id);
    const reassigned = await reassignForeignLedgersToUser(ctx, user._id);
    return { userId: user._id, unowned, reassigned };
  },
});

/** Remap all ledger rows to a specific user (internal / cutover). */
export const reassignAllLedgersToUserId = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const unowned = await claimUnownedToUser(ctx, args.userId);
    const reassigned = await reassignForeignLedgersToUser(ctx, args.userId);
    return { userId: args.userId, email: user.email ?? null, unowned, reassigned };
  },
});

/** Internal: provision role-based modules for every user (or one email). */
export const ensureModulesForUsers = internalMutation({
  args: {
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email?.trim().toLowerCase();
    const users = email
      ? [
          await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", email))
            .unique(),
        ].filter(Boolean)
      : await ctx.db.query("users").collect();
    const results = [];
    for (const user of users) {
      if (!user) continue;
      const result = await ensureModulesForUser(ctx, user);
      results.push({
        userId: user._id,
        email: user.email ?? null,
        role: user.role ?? null,
        ...result,
      });
    }
    return results;
  },
});

/**
 * Admin / cutover: find Password user by email and attach every ledger row.
 */
export const assignAllLedgersToEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      throw new Error(
        `No user with email ${email}. Sign up at /sign-in with that email first.`,
      );
    }
    const unowned = await claimUnownedToUser(ctx, user._id);
    const reassigned = await reassignForeignLedgersToUser(ctx, user._id);
    return { userId: user._id, email: user.email ?? email, unowned, reassigned };
  },
});

/**
 * CLI: create Password account only (no ledger reassignment).
 */
export const createPasswordAccount = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: args.name?.trim() || "Test User",
      },
    });
    return { userId: user._id, email };
  },
});

/**
 * Cutover: create Password account for email and attach all ledger data.
 * Pass a password you will use to sign in.
 */
export const bootstrapOwnerAccount = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: args.name?.trim() || "Jayrr",
      },
    });
    const assigned = await ctx.runMutation(
      internal.migrations.reassignAllLedgersToUserId,
      { userId: user._id },
    );
    return {
      userId: user._id,
      email,
      transactions: assigned.reassigned.transactions ?? 0,
      assigned,
    };
  },
});

/** Set password for an existing Password account (cutover / recovery). */
export const setPasswordForEmail = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
    });
    return { email, updated: true };
  },
});

/** Cutover / CLI: set role by email. Allowed only while no admin exists yet. */
export const setRoleByEmailCli = mutation({
  args: {
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("normal"),
      v.literal("premium"),
    ),
  },
  handler: async (ctx, args) => {
    const admins = await ctx.db
      .query("users")
      .withIndex("role", (q) => q.eq("role", "admin"))
      .collect();
    if (admins.length > 0) {
      throw new Error(
        "An admin already exists. Sign in as admin and use users.setRoleByEmail.",
      );
    }
    const email = args.email.trim().toLowerCase();
    const target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!target) {
      throw new Error(`No user with email ${email}`);
    }
    await ctx.db.patch(target._id, { role: args.role });
    const updated = await ctx.db.get(target._id);
    if (updated) {
      await ensureModulesForUser(ctx, updated);
    }
    return { userId: target._id, email, role: args.role };
  },
});
