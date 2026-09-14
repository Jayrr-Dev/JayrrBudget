import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

/**
 * UI snake_case → Convex table.
 * `scope: "ledger"` = filter by signed-in owner's userId.
 * `scope: "auth"` = admin sees all rows (Convex Auth system tables).
 */
const TABLE_META = {
  // Ledger (owner-scoped)
  institutions: { convex: "institutions", scope: "ledger" },
  accounts: { convex: "accounts", scope: "ledger" },
  loan_terms: { convex: "loanTerms", scope: "ledger" },
  loan_payment_links: { convex: "loanPaymentLinks", scope: "ledger" },
  statement_uploads: { convex: "statementUploads", scope: "ledger" },
  transaction_sections: { convex: "transactionSections", scope: "ledger" },
  transaction_spreads: { convex: "transactionSpreads", scope: "ledger" },
  transaction_categories: { convex: "transactionCategories", scope: "ledger" },
  transaction_subcategories: {
    convex: "transactionSubcategories",
    scope: "ledger",
  },
  transaction_types: { convex: "transactionTypes", scope: "ledger" },
  transaction_kinds: { convex: "transactionKinds", scope: "ledger" },
  transactions: { convex: "transactions", scope: "ledger" },
  app_modules: { convex: "appModules", scope: "ledger" },
  scratch_notes: { convex: "scratchNotes", scope: "ledger" },
  // Auth / users (global admin view)
  users: { convex: "users", scope: "auth" },
  auth_sessions: { convex: "authSessions", scope: "auth" },
  auth_accounts: { convex: "authAccounts", scope: "auth" },
  auth_refresh_tokens: { convex: "authRefreshTokens", scope: "auth" },
  auth_verification_codes: { convex: "authVerificationCodes", scope: "auth" },
  auth_verifiers: { convex: "authVerifiers", scope: "auth" },
  auth_rate_limits: { convex: "authRateLimits", scope: "auth" },
} as const;

type UiTableName = keyof typeof TABLE_META;

function isUiTableName(value: string): value is UiTableName {
  return value in TABLE_META;
}

function serializeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  return value;
}

function serializeRow(
  row: Record<string, unknown>,
  redactSecrets: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (redactSecrets && (key === "secret" || key === "code" || key === "verifier")) {
      out[key] = value ? "[redacted]" : null;
      continue;
    }
    out[key] = serializeValue(value);
  }
  return out;
}

async function loadTableRows(
  ctx: { db: any },
  uiName: UiTableName,
  ownerId: Id<"users">,
) {
  const meta = TABLE_META[uiName];
  if (meta.scope === "ledger") {
    return await ctx.db
      .query(meta.convex)
      .withIndex("by_userId", (q: any) => q.eq("userId", ownerId))
      .collect();
  }
  return await ctx.db.query(meta.convex).collect();
}

/** Admin schema overview: ledger (yours) + auth/user system tables. */
export const schemaOverview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "admin");
    const tables = [];
    for (const uiName of Object.keys(TABLE_META) as UiTableName[]) {
      const meta = TABLE_META[uiName];
      const rows = await loadTableRows(ctx, uiName, user._id);
      const sample = rows[0] as Record<string, unknown> | undefined;
      tables.push({
        name: meta.convex,
        uiName,
        scope: meta.scope,
        approxCount: rows.length,
        sampleKeys: sample
          ? Object.keys(sample).filter((k) => !k.startsWith("_"))
          : [],
      });
    }
    return { tables };
  },
});

/** Admin-only paginated browse. */
export const browseTable = query({
  args: {
    table: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    if (!isUiTableName(args.table)) {
      throw new Error(`Unknown table: ${args.table}`);
    }
    const meta = TABLE_META[args.table];
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const offset = Math.max(args.offset ?? 0, 0);

    const all = await loadTableRows(ctx, args.table, user._id);
    const page = all.slice(offset, offset + limit);
    const columns =
      page[0] != null
        ? Object.keys(page[0])
        : all[0] != null
          ? Object.keys(all[0])
          : ["_id"];

    return {
      table: args.table,
      columns,
      rows: page.map((row) =>
        serializeRow(row as Record<string, unknown>, meta.scope === "auth"),
      ),
      total: all.length,
      limit,
      offset,
    };
  },
});
