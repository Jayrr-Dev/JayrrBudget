import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { ensureUser } from "./lib/auth";

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

async function claimUnownedToUser(
  ctx: { db: any },
  userId: string,
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

/**
 * One-time backfill: claim pre-auth import rows that have no userId.
 * First signed-in admin runs this after users.ensure.
 */
export const claimUnownedData = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureUser(ctx);
    const patched = await claimUnownedToUser(ctx, user._id);
    return { userId: user._id, patched };
  },
});

/**
 * CLI / one-shot: create owner "Jayrr" and assign all unowned ledger rows.
 * First Clerk sign-in will link this bootstrap profile (see ensureUser).
 */
export const assignDatasetToJayrr = mutation({
  args: {
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = "Jayrr";
    const email = args.email?.trim() || null;
    const allUsers = await ctx.db.query("users").collect();

    const clerkOwned = allUsers.filter(
      (u) => !u.tokenIdentifier.startsWith("bootstrap:"),
    );
    if (clerkOwned.length > 0) {
      throw new Error(
        "A Clerk-linked user already exists. Sign in and run migrations.claimUnownedData instead.",
      );
    }

    let owner = allUsers.find(
      (u) =>
        u.tokenIdentifier.startsWith("bootstrap:") &&
        (u.name === name || (email && u.email === email)),
    );

    if (!owner) {
      const id = await ctx.db.insert("users", {
        tokenIdentifier: `bootstrap:${email ?? name.toLowerCase()}`,
        clerkUserId: `bootstrap:${name.toLowerCase()}`,
        email,
        name,
        createdAt: Date.now(),
      });
      owner = (await ctx.db.get(id))!;
    } else if (email && owner.email !== email) {
      await ctx.db.patch(owner._id, { email, name });
      owner = (await ctx.db.get(owner._id))!;
    }

    const patched = await claimUnownedToUser(ctx, owner._id);
    return { userId: owner._id, name: owner.name, email: owner.email, patched };
  },
});
