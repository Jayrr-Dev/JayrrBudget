import { COLUMN_HELP } from "@/domains/db-explorer/domain/columnHelp";
import type {
  DbColumnInfo,
  DbForeignKey,
  DbSchemaGraph,
  DbTableBrowseResult,
  DbTableInfo,
} from "@/domains/db-explorer/domain/types";
import {
  cachedConvexRead,
  SHORT_READ_TTL_MS,
} from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import { getAuthenticatedConvexClient } from "@/shared/convex/httpClient.server";

const CONVEX_TO_UI: Record<string, string> = {
  institutions: "institutions",
  accounts: "accounts",
  loanTerms: "loan_terms",
  loanPaymentLinks: "loan_payment_links",
  statementUploads: "statement_uploads",
  transactions: "transactions",
  transactionSections: "transaction_sections",
  transactionSpreads: "transaction_spreads",
  transactionCategories: "transaction_categories",
  transactionSubcategories: "transaction_subcategories",
  transactionTypes: "transaction_types",
  transactionKinds: "transaction_kinds",
  appModules: "app_modules",
  scratchNotes: "scratch_notes",
  canvasScenes: "canvas_scenes",
  piggyPings: "piggy_pings",
  budgets: "budgets",
  users: "users",
  authSessions: "auth_sessions",
  authAccounts: "auth_accounts",
  authRefreshTokens: "auth_refresh_tokens",
  authVerificationCodes: "auth_verification_codes",
  authVerifiers: "auth_verifiers",
  authRateLimits: "auth_rate_limits",
};

const UI_TABLES = new Set(Object.values(CONVEX_TO_UI));

/** Logical joins for the schema map (Convex has no SQL FKs). */
const LEDGER_FOREIGN_KEYS: DbForeignKey[] = [
  {
    fromTable: "accounts",
    fromColumns: ["institutionId"],
    toTable: "institutions",
    toColumns: ["institutionId"],
    onDelete: undefined,
  },
  {
    fromTable: "loan_terms",
    fromColumns: ["accountId"],
    toTable: "accounts",
    toColumns: ["accountId"],
    onDelete: undefined,
  },
  {
    fromTable: "loan_payment_links",
    fromColumns: ["loanAccountId"],
    toTable: "accounts",
    toColumns: ["accountId"],
    onDelete: undefined,
  },
  {
    fromTable: "loan_payment_links",
    fromColumns: ["transactionId"],
    toTable: "transactions",
    toColumns: ["transactionId"],
    onDelete: undefined,
  },
  {
    fromTable: "statement_uploads",
    fromColumns: ["accountId"],
    toTable: "accounts",
    toColumns: ["accountId"],
    onDelete: undefined,
  },
  {
    fromTable: "transactions",
    fromColumns: ["accountId"],
    toTable: "accounts",
    toColumns: ["accountId"],
    onDelete: undefined,
  },
  {
    fromTable: "transaction_categories",
    fromColumns: ["sectionLegacyId"],
    toTable: "transaction_sections",
    toColumns: ["legacyId"],
    onDelete: undefined,
  },
  {
    fromTable: "transaction_subcategories",
    fromColumns: ["categoryLegacyId"],
    toTable: "transaction_categories",
    toColumns: ["legacyId"],
    onDelete: undefined,
  },
  // Auth graph
  {
    fromTable: "piggy_pings",
    fromColumns: ["userId"],
    toTable: "users",
    toColumns: ["_id"],
    onDelete: undefined,
  },
  {
    fromTable: "budgets",
    fromColumns: ["userId"],
    toTable: "users",
    toColumns: ["_id"],
    onDelete: undefined,
  },
  {
    fromTable: "auth_sessions",
    fromColumns: ["userId"],
    toTable: "users",
    toColumns: ["_id"],
    onDelete: undefined,
  },
  {
    fromTable: "auth_accounts",
    fromColumns: ["userId"],
    toTable: "users",
    toColumns: ["_id"],
    onDelete: undefined,
  },
  {
    fromTable: "auth_refresh_tokens",
    fromColumns: ["sessionId"],
    toTable: "auth_sessions",
    toColumns: ["_id"],
    onDelete: undefined,
  },
  {
    fromTable: "auth_verification_codes",
    fromColumns: ["accountId"],
    toTable: "auth_accounts",
    toColumns: ["_id"],
    onDelete: undefined,
  },
  {
    fromTable: "auth_verifiers",
    fromColumns: ["sessionId"],
    toTable: "auth_sessions",
    toColumns: ["_id"],
    onDelete: undefined,
  },
];

/** Fields that are always set on live writes (solid connector ends). */
const REQUIRED_FIELDS = new Set([
  "userId",
  "institutionId",
  "legacyId",
  "slug",
  "name",
  "posted",
  "amount",
  "currency",
  "loanAccountId",
]);

/** Table-specific required fields (overrides / additions). */
const REQUIRED_BY_TABLE: Record<string, Set<string>> = {
  accounts: new Set(["accountId", "institutionId"]),
  loan_terms: new Set(["accountId"]),
  transactions: new Set(["accountId", "transactionId"]),
  institutions: new Set(["institutionId"]),
  auth_sessions: new Set(["userId", "expirationTime"]),
  auth_accounts: new Set(["userId", "provider", "providerAccountId"]),
  auth_refresh_tokens: new Set(["sessionId", "expirationTime"]),
  auth_verification_codes: new Set([
    "accountId",
    "provider",
    "code",
    "expirationTime",
  ]),
  auth_rate_limits: new Set(["identifier", "lastAttemptTime", "attemptsLeft"]),
};

const UNIQUE_FIELDS = new Set([
  "institutionId",
  "accountId",
  "transactionId",
  "legacyId",
  "slug",
]);

/** Fallback columns when a table has no sample row yet. */
const FALLBACK_COLUMNS: Record<string, string[]> = {
  institutions: ["institutionId", "name", "userId", "createdAt", "updatedAt"],
  accounts: [
    "accountId",
    "institutionId",
    "name",
    "type",
    "subtype",
    "userId",
    "updatedAt",
  ],
  loan_terms: ["accountId", "principalStart", "annualRate", "userId"],
  loan_payment_links: [
    "loanAccountId",
    "paymentNumber",
    "transactionId",
    "userId",
  ],
  statement_uploads: ["uploadId", "filename", "status", "accountId", "userId"],
  transactions: [
    "transactionId",
    "posted",
    "accountId",
    "description",
    "amount",
    "userId",
  ],
  transaction_sections: ["legacyId", "name", "description", "userId"],
  transaction_spreads: [
    "legacyId",
    "name",
    "targetPercent",
    "description",
    "userId",
  ],
  transaction_categories: [
    "legacyId",
    "name",
    "description",
    "sectionLegacyId",
    "userId",
  ],
  transaction_subcategories: [
    "legacyId",
    "name",
    "description",
    "categoryLegacyId",
    "userId",
  ],
  transaction_types: ["legacyId", "name", "description", "userId"],
  transaction_kinds: ["legacyId", "name", "description", "userId"],
  app_modules: ["legacyId", "slug", "name", "href", "enabled", "userId"],
  scratch_notes: ["tabs", "activeId", "receiveId", "userId", "updatedAt"],
  piggy_pings: [
    "name",
    "title",
    "message",
    "pingType",
    "cycle",
    "trigger",
    "triggerCount",
    "isActive",
    "startDate",
    "endDate",
    "notes",
    "userId",
    "createdAt",
  ],
  budgets: [
    "name",
    "classLookup",
    "descriptionLookup",
    "amount",
    "warningThreshold",
    "overageThreshold",
    "isActive",
    "userId",
    "createdAt",
    "updatedAt",
  ],
  users: ["email", "name", "role", "image", "emailVerificationTime"],
  auth_sessions: ["userId", "expirationTime"],
  auth_accounts: ["userId", "provider", "providerAccountId", "secret"],
  auth_refresh_tokens: ["sessionId", "expirationTime", "parentRefreshTokenId"],
  auth_verification_codes: ["accountId", "provider", "code", "expirationTime"],
  auth_verifiers: ["sessionId", "signature"],
  auth_rate_limits: ["identifier", "lastAttemptTime", "attemptsLeft"],
};

export type DbTableName = string;

export function isDbTableName(value: string): boolean {
  return UI_TABLES.has(value);
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function columnDescription(uiTable: string, field: string): string | undefined {
  const help = COLUMN_HELP[uiTable];
  if (!help) return undefined;
  if (help[field]) return help[field];
  const snake = camelToSnake(field);
  return help[snake];
}

function isRequiredField(uiTable: string, key: string): boolean {
  if (REQUIRED_BY_TABLE[uiTable]?.has(key)) return true;
  return REQUIRED_FIELDS.has(key);
}

function buildColumns(uiName: string, sampleKeys: string[]): DbColumnInfo[] {
  const keys =
    sampleKeys.length > 0 ? sampleKeys : (FALLBACK_COLUMNS[uiName] ?? []);
  return keys.map((key) => ({
    name: key,
    dataType: "convex",
    columnType: "any",
    notNull: isRequiredField(uiName, key),
    primaryKey: key === "_id" || UNIQUE_FIELDS.has(key),
    unique: UNIQUE_FIELDS.has(key),
    description: columnDescription(uiName, key),
  }));
}

export async function getSchemaGraph(): Promise<DbSchemaGraph> {
  const overview = await cachedConvexRead({
    name: "dbExplorer.schemaOverview",
    load: async () => {
      const client = await getAuthenticatedConvexClient();
      return client.query(api.dbExplorer.schemaOverview, {});
    },
  });
  const tables: DbTableInfo[] = overview.tables.map(
    (table: (typeof overview.tables)[number]) => {
      const uiName = table.uiName ?? CONVEX_TO_UI[table.name] ?? table.name;
      return {
        name: uiName,
        rowCount: table.approxCount,
        columns: buildColumns(uiName, table.sampleKeys),
        scope: table.scope === "auth" ? "auth" : "ledger",
      };
    },
  );

  const present = new Set(tables.map((table) => table.name));
  const foreignKeys = LEDGER_FOREIGN_KEYS.filter(
    (fk) => present.has(fk.fromTable) && present.has(fk.toTable),
  );

  return { tables, foreignKeys };
}

export async function browseTable(
  name: string,
  limit = 50,
  offset = 0,
): Promise<DbTableBrowseResult> {
  if (!isDbTableName(name)) {
    throw new Error(`Unknown table: ${name}`);
  }
  return cachedConvexRead({
    name: "dbExplorer.browseTable",
    args: { table: name, limit, offset },
    ttlMs: SHORT_READ_TTL_MS,
    load: async () => {
      const client = await getAuthenticatedConvexClient();
      return client.query(api.dbExplorer.browseTable, {
        table: name,
        limit,
        offset,
      });
    },
  });
}
