import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
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
 * After Convex Auth signup: point every ledger row at the signed-in user.
 * Use once when replacing Clerk/bootstrap ownership with a new Password user.
 */
export const reassignAllLedgersToCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unowned = await claimUnownedToUser(ctx, user._id);
    const reassigned = await reassignForeignLedgersToUser(ctx, user._id);
    return { userId: user._id, unowned, reassigned };
  },
});

/** Delete legacy Clerk/bootstrap user docs that are not the signed-in user. */
export const deleteLegacyUserProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    const current = await requireUser(ctx);
    const all = await ctx.db.query("users").collect();
    let deleted = 0;
    for (const row of all) {
      if (row._id === current._id) continue;
      const legacy =
        row.tokenIdentifier !== undefined || row.clerkUserId !== undefined;
      if (!legacy) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted, kept: current._id };
  },
});
