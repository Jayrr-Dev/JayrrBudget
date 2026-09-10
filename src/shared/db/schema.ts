import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const institutions = sqliteTable("institutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Stable external code. Prefer integer `id` for new FKs. */
  institutionId: text("institution_id").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: text("account_id").notNull().unique(),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.institutionId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  officialName: text("official_name"),
  mask: text("mask"),
  type: text("type"),
  subtype: text("subtype"),
  currentBalance: real("current_balance"),
  availableBalance: real("available_balance"),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const statementUploads = sqliteTable("statement_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").unique(),
  status: text("status").notNull().default("pending"),
  /** Resolved ledger account when known. */
  accountId: text("account_id").references(() => accounts.accountId, {
    onDelete: "set null",
  }),
  /** Printed OCR/parse text — identity is `account_id`. */
  institutionName: text("institution_name"),
  accountName: text("account_name"),
  accountMask: text("account_mask"),
  currency: text("currency").default("CAD"),
  pageCount: integer("page_count"),
  transactionCount: integer("transaction_count").default(0),
  insertedCount: integer("inserted_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  statementPeriodStart: text("statement_period_start"),
  statementPeriodEnd: text("statement_period_end"),
  openingBalance: real("opening_balance"),
  closingBalance: real("closing_balance"),
  totalDebits: real("total_debits"),
  totalCredits: real("total_credits"),
  transactionSum: real("transaction_sum"),
  computedClosing: real("computed_closing"),
  balanceDelta: real("balance_delta"),
  balanceOk: integer("balance_ok", { mode: "boolean" }),
  ocrMarkdown: text("ocr_markdown"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

/** Thin ledger line. Money/dates/location/payment live in atom tables. */
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Stable external fingerprint (`stmt_…`). */
  transactionId: text("transaction_id").notNull().unique(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  description: text("description").notNull(),
  pending: integer("pending", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("statement"),
  statementUploadId: integer("statement_upload_id").references(
    () => statementUploads.id,
    { onDelete: "set null" },
  ),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const transactionAmounts = sqliteTable("transaction_amounts", {
  transactionId: integer("transaction_id")
    .primaryKey()
    .references(() => transactions.id, { onDelete: "cascade" }),
  /** Integer cents. Statement sign: positive = money out. */
  amountMinor: integer("amount_minor").notNull(),
  currencyCode: text("currency_code").notNull().default("CAD"),
  runningBalanceMinor: integer("running_balance_minor"),
});

export const transactionDates = sqliteTable("transaction_dates", {
  transactionId: integer("transaction_id")
    .primaryKey()
    .references(() => transactions.id, { onDelete: "cascade" }),
  postedDate: text("posted_date").notNull(),
  authorizedDate: text("authorized_date"),
});

export const transactionLocations = sqliteTable("transaction_locations", {
  transactionId: integer("transaction_id")
    .primaryKey()
    .references(() => transactions.id, { onDelete: "cascade" }),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  postalCode: text("postal_code"),
});

export const transactionPaymentRefs = sqliteTable("transaction_payment_refs", {
  transactionId: integer("transaction_id")
    .primaryKey()
    .references(() => transactions.id, { onDelete: "cascade" }),
  checkNumber: text("check_number"),
  referenceNumber: text("reference_number"),
  transactionCode: text("transaction_code"),
  paymentChannel: text("payment_channel"),
  foreignAmountMinor: integer("foreign_amount_minor"),
  foreignCurrency: text("foreign_currency"),
});

/** Parser / hygiene bank labels — not the spend taxonomy. */
export const transactionBankCategories = sqliteTable(
  "transaction_bank_categories",
  {
    transactionId: integer("transaction_id")
      .primaryKey()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryPrimary: text("category_primary"),
    categoryDetailed: text("category_detailed"),
    categoryConfidence: text("category_confidence"),
  },
);

export const entities = sqliteTable("entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(),
  parentEntityId: integer("parent_entity_id"),
  website: text("website"),
  logoUrl: text("logo_url"),
  source: text("source").notNull().default("ai"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const entityAliases = sqliteTable(
  "entity_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    source: text("source").notNull().default("ai"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("entity_aliases_entity_alias_uidx").on(table.entityId, table.alias)],
);

export const taxonomyNodes = sqliteTable("taxonomy_nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  facet: text("facet").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  path: text("path").notNull(),
  depth: integer("depth").notNull().default(0),
  source: text("source").notNull().default("ai"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Job + merchant parse only. No copied ledger amount/date/location. */
export const transactionEnrichment = sqliteTable("transaction_enrichment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.id, { onDelete: "cascade" }),
  merchantRaw: text("merchant_raw"),
  merchantClean: text("merchant_clean"),
  channel: text("channel"),
  txnKind: text("txn_kind"),
  storeNumber: text("store_number"),
  legalSuffix: text("legal_suffix"),
  enrichmentStatus: text("enrichment_status").notNull().default("pending"),
  enrichmentConfidence: text("enrichment_confidence"),
  enrichmentModel: text("enrichment_model"),
  enrichedAt: integer("enriched_at", { mode: "timestamp_ms" }),
  error: text("error"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const transactionEntities = sqliteTable(
  "transaction_entities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    confidence: text("confidence"),
    source: text("source").notNull().default("ai"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("transaction_entities_txn_role_uidx").on(
      table.transactionId,
      table.role,
    ),
  ],
);

export const enrichmentTokens = sqliteTable("enrichment_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const transactionLabels = sqliteTable(
  "transaction_labels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    confidence: text("confidence"),
    source: text("source").notNull().default("ai"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("transaction_labels_txn_node_role_uidx").on(
      table.transactionId,
      table.nodeId,
      table.role,
    ),
  ],
);

export const bankHistoryFiles = sqliteTable("bank_history_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  accountId: text("account_id").references(() => accounts.accountId, {
    onDelete: "set null",
  }),
  accountMask: text("account_mask"),
  accountType: text("account_type"),
  productName: text("product_name"),
  rowCount: integer("row_count").notNull().default(0),
  importedAt: integer("imported_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const bankHistoryRows = sqliteTable("bank_history_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id")
    .notNull()
    .references(() => bankHistoryFiles.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull().unique(),
  accountMask: text("account_mask").notNull(),
  accountType: text("account_type").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  debit: real("debit"),
  credit: real("credit"),
  direction: text("direction").notNull(),
  amount: real("amount").notNull(),
  cardNumber: text("card_number"),
  matchedTransactionId: integer("matched_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" },
  ),
  matchStatus: text("match_status").notNull().default("unmatched"),
  /** Gold-standard direction after match, when applied to ledger. */
  bankDirection: text("bank_direction"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const appModules = sqliteTable("app_modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  href: text("href").notNull(),
  icon: text("icon").notNull().default("IconPuzzle"),
  category: text("category").notNull().default("core"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isCore: integer("is_core", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
