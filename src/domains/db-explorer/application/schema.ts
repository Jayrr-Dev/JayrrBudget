import type {
  DbColumnInfo,
  DbSchemaGraph,
  DbTableBrowseResult,
  DbTableInfo,
} from "@/domains/db-explorer/domain/types";
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
};

export type DbTableName = string;

export function isDbTableName(value: string): boolean {
  return Object.values(CONVEX_TO_UI).includes(value);
}

export async function getSchemaGraph(): Promise<DbSchemaGraph> {
  const client = await getAuthenticatedConvexClient();
  const overview = await client.query(api.dbExplorer.schemaOverview, {});
  const tables: DbTableInfo[] = overview.tables.map((table) => ({
    name: CONVEX_TO_UI[table.name] ?? table.name,
    rowCount: table.approxCount,
    columns: table.sampleKeys.map(
      (key): DbColumnInfo => ({
        name: key,
        dataType: "convex",
        columnType: "any",
        notNull: false,
        primaryKey: false,
        unique: false,
      }),
    ),
  }));
  return { tables, foreignKeys: [] };
}

export async function browseTable(
  name: string,
  limit = 50,
  offset = 0,
): Promise<DbTableBrowseResult> {
  return {
    table: name,
    columns: ["_note"],
    rows: [
      {
        _note:
          "SQLite browse retired. Open the Convex dashboard to inspect live rows.",
      },
    ],
    total: 1,
    limit,
    offset,
  };
}
