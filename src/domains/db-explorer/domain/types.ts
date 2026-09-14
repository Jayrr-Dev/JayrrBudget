export type DbColumnInfo = {
  name: string;
  dataType: string;
  columnType: string;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  description?: string;
};

export type DbForeignKey = {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  onDelete: string | undefined;
};

export type DbTableScope = "ledger" | "auth";

export type DbTableInfo = {
  name: string;
  rowCount: number;
  columns: DbColumnInfo[];
  /** ledger = your rows; auth = global Convex Auth / users. */
  scope?: DbTableScope;
};

export type DbSchemaGraph = {
  tables: DbTableInfo[];
  foreignKeys: DbForeignKey[];
};

export type DbTableBrowseResult = {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};
