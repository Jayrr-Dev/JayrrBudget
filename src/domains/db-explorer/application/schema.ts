import { count, getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  accounts,
  appModules,
  institutions,
  statementUploads,
  transactionCategories,
  transactionKinds,
  transactionSections,
  transactionSubcategories,
  transactionTypes,
  transactions,
} from "@/shared/db/schema";
import { getDb } from "@/shared/db";
import { columnHelp } from "@/domains/db-explorer/domain/columnHelp";
import type {
  DbColumnInfo,
  DbForeignKey,
  DbSchemaGraph,
  DbTableBrowseResult,
  DbTableInfo,
} from "@/domains/db-explorer/domain/types";

const TABLE_MAP = {
  institutions,
  accounts,
  statement_uploads: statementUploads,
  transactions,
  transaction_sections: transactionSections,
  transaction_categories: transactionCategories,
  transaction_subcategories: transactionSubcategories,
  transaction_types: transactionTypes,
  transaction_kinds: transactionKinds,
  app_modules: appModules,
} as const satisfies Record<string, SQLiteTable>;

export type DbTableName = keyof typeof TABLE_MAP;

const TABLE_NAMES = Object.keys(TABLE_MAP) as DbTableName[];

export function isDbTableName(value: string): value is DbTableName {
  return value in TABLE_MAP;
}

function columnInfo(table: SQLiteTable, tableName: string): DbColumnInfo[] {
  const columns = getTableColumns(table);
  return Object.values(columns).map((col) => ({
    name: col.name,
    dataType: col.dataType,
    columnType: col.columnType,
    notNull: col.notNull,
    primaryKey: col.primary,
    unique: Boolean(col.isUnique),
    description: columnHelp(tableName, col.name),
  }));
}

/** Drizzle rows use JS keys; browser looks up SQL names. */
export function rowsWithSqlColumnNames(
  table: SQLiteTable,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const columns = getTableColumns(table);
  return rows.map((row) => {
    const keyed: Record<string, unknown> = {};
    for (const [jsKey, col] of Object.entries(columns)) {
      keyed[col.name] = row[jsKey];
    }
    return keyed;
  });
}

function foreignKeysFor(table: SQLiteTable, fromTable: string): DbForeignKey[] {
  const config = getTableConfig(table);
  return config.foreignKeys.map((fk) => {
    const ref = fk.reference();
    return {
      fromTable,
      fromColumns: ref.columns.map((col) => col.name),
      toTable: getTableConfig(ref.foreignTable).name,
      toColumns: ref.foreignColumns.map((col) => col.name),
      onDelete: fk.onDelete,
    };
  });
}

export async function getSchemaGraph(): Promise<DbSchemaGraph> {
  const db = getDb();
  const tables: DbTableInfo[] = [];
  const foreignKeys: DbForeignKey[] = [];

  for (const name of TABLE_NAMES) {
    const table = TABLE_MAP[name];
    const [{ value: rowCount }] = await db.select({ value: count() }).from(table);

    tables.push({
      name,
      rowCount: Number(rowCount),
      columns: columnInfo(table, name),
    });
    foreignKeys.push(...foreignKeysFor(table, name));
  }

  return { tables, foreignKeys };
}

export async function browseTable(
  tableName: DbTableName,
  options?: { limit?: number; offset?: number },
): Promise<DbTableBrowseResult> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const offset = Math.max(options?.offset ?? 0, 0);
  const table = TABLE_MAP[tableName];
  const db = getDb();

  const [{ value: total }] = await db.select({ value: count() }).from(table);
  const rows = await db.select().from(table).limit(limit).offset(offset);
  const columns = columnInfo(table, tableName).map((col) => col.name);

  return {
    table: tableName,
    columns,
    rows: rowsWithSqlColumnNames(table, rows as Record<string, unknown>[]),
    total: Number(total),
    limit,
    offset,
  };
}
