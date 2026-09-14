import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const TABLE_NAMES = [
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

/** Lightweight schema list for the Database explorer (Convex tables). */
export const schemaOverview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tables = [];
    for (const name of TABLE_NAMES) {
      const rows = await ctx.db
        .query(name)
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(1);
      const countSample = await ctx.db
        .query(name)
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      tables.push({
        name,
        approxCount: countSample.length,
        sampleKeys: rows[0]
          ? Object.keys(rows[0]).filter((k) => !k.startsWith("_"))
          : [],
      });
    }
    return { tables };
  },
});

export const browseTable = query({
  args: {},
  handler: async () => {
    return {
      ok: false as const,
      error: "Use Convex dashboard for table browse; SQLite explorer retired.",
    };
  },
});
