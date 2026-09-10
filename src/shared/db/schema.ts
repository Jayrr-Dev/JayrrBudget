import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const institutions = sqliteTable("institutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  institutionName: text("institution_name"),
  accountName: text("account_name"),
  accountMask: text("account_mask"),
  currency: text("currency").default("CAD"),
  pageCount: integer("page_count"),
  transactionCount: integer("transaction_count").default(0),
  insertedCount: integer("inserted_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  /** Statement summary — kept on the upload, not mixed into ledger lines. */
  statementPeriodStart: text("statement_period_start"),
  statementPeriodEnd: text("statement_period_end"),
  openingBalance: real("opening_balance"),
  closingBalance: real("closing_balance"),
  totalDebits: real("total_debits"),
  totalCredits: real("total_credits"),
  transactionSum: real("transaction_sum"),
  computedClosing: real("computed_closing"),
  balanceDelta: real("balance_delta"),
  /** 1 = balanced, 0 = mismatch, null = unknown / missing opening or closing */
  balanceOk: integer("balance_ok", { mode: "boolean" }),
  ocrMarkdown: text("ocr_markdown"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: text("transaction_id").notNull().unique(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.institutionId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  merchantName: text("merchant_name"),
  merchantEntityId: text("merchant_entity_id"),
  merchantCategoryCode: text("merchant_category_code"),
  originalDescription: text("original_description"),
  amount: real("amount").notNull(),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  date: text("date").notNull(),
  datetime: text("datetime"),
  authorizedDate: text("authorized_date"),
  authorizedDatetime: text("authorized_datetime"),
  pending: integer("pending", { mode: "boolean" }).notNull().default(false),
  pendingTransactionId: text("pending_transaction_id"),
  categoryPrimary: text("category_primary"),
  categoryDetailed: text("category_detailed"),
  categoryConfidence: text("category_confidence"),
  paymentChannel: text("payment_channel"),
  transactionCode: text("transaction_code"),
  checkNumber: text("check_number"),
  accountOwner: text("account_owner"),
  website: text("website"),
  logoUrl: text("logo_url"),
  categoryIconUrl: text("category_icon_url"),
  locationCity: text("location_city"),
  locationRegion: text("location_region"),
  locationPostalCode: text("location_postal_code"),
  locationCountry: text("location_country"),
  locationLat: real("location_lat"),
  locationLon: real("location_lon"),
  locationAddress: text("location_address"),
  locationStoreNumber: text("location_store_number"),
  counterpartiesJson: text("counterparties_json"),
  paymentMetaJson: text("payment_meta_json"),
  runningBalance: real("running_balance"),
  source: text("source").notNull().default("statement"),
  statementUploadId: integer("statement_upload_id").references(
    () => statementUploads.id,
    { onDelete: "set null" },
  ),
  /** Bank CSV debit/credit after history cross-check. */
  bankDirection: text("bank_direction"),
  /** matched = found in CSV history, unmatched = PDF-only in CSV date window. */
  historyMatch: text("history_match"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Company / brand / subsidiary / product graph for merchant mining. */
export const entities = sqliteTable("entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(), // company | subsidiary | brand | product
  parentEntityId: integer("parent_entity_id"),
  aliasesJson: text("aliases_json"),
  source: text("source").notNull().default("ai"), // seed | ai | user
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Faceted taxonomy: section → category → type, plus tag / store_type / food_type. */
export const taxonomyNodes = sqliteTable("taxonomy_nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  facet: text("facet").notNull(), // section | category | type | tag | store_type | food_type
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  path: text("path").notNull(),
  depth: integer("depth").notNull().default(0),
  source: text("source").notNull().default("ai"), // seed | ai | user
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** 1:1 enrichment atoms for analytics / mining (on top of raw transaction fact). */
export const transactionEnrichment = sqliteTable("transaction_enrichment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.id, { onDelete: "cascade" }),
  merchantRaw: text("merchant_raw"),
  merchantClean: text("merchant_clean"),
  companyEntityId: integer("company_entity_id").references(() => entities.id, {
    onDelete: "set null",
  }),
  brandEntityId: integer("brand_entity_id").references(() => entities.id, {
    onDelete: "set null",
  }),
  subsidiaryEntityId: integer("subsidiary_entity_id").references(
    () => entities.id,
    { onDelete: "set null" },
  ),
  productEntityId: integer("product_entity_id").references(() => entities.id, {
    onDelete: "set null",
  }),
  storeTypeNodeId: integer("store_type_node_id").references(
    () => taxonomyNodes.id,
    { onDelete: "set null" },
  ),
  foodTypeNodeId: integer("food_type_node_id").references(
    () => taxonomyNodes.id,
    { onDelete: "set null" },
  ),
  sectionNodeId: integer("section_node_id").references(() => taxonomyNodes.id, {
    onDelete: "set null",
  }),
  categoryNodeId: integer("category_node_id").references(
    () => taxonomyNodes.id,
    { onDelete: "set null" },
  ),
  typeNodeId: integer("type_node_id").references(() => taxonomyNodes.id, {
    onDelete: "set null",
  }),
  channel: text("channel"), // online | in_store | other
  txnKind: text("txn_kind"), // purchase | fee | refund | payment | ...
  amountSigned: real("amount_signed"),
  amountAbs: real("amount_abs"),
  direction: text("direction"), // outflow | inflow
  datePosted: text("date_posted"),
  dateAuthorized: text("date_authorized"),
  locationCity: text("location_city"),
  locationRegion: text("location_region"),
  locationCountry: text("location_country"),
  storeNumber: text("store_number"),
  legalSuffix: text("legal_suffix"),
  parseTokensJson: text("parse_tokens_json"),
  enrichmentStatus: text("enrichment_status").notNull().default("pending"),
  enrichmentConfidence: text("enrichment_confidence"),
  enrichmentModel: text("enrichment_model"),
  enrichedAt: integer("enriched_at", { mode: "timestamp_ms" }),
  error: text("error"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Many labels per transaction (tags + tree roles). */
export const transactionLabels = sqliteTable("transaction_labels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  nodeId: integer("node_id")
    .notNull()
    .references(() => taxonomyNodes.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // section | category | type | tag | store_type | food_type
  confidence: text("confidence"),
  source: text("source").notNull().default("ai"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** One CIBC CSV export file. Not mixed into the statement ledger. */
export const bankHistoryFiles = sqliteTable("bank_history_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  accountMask: text("account_mask"),
  accountType: text("account_type"),
  productName: text("product_name"),
  rowCount: integer("row_count").notNull().default(0),
  importedAt: integer("imported_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Bank website transaction history (debit/credit columns).
 * Gold-standard for sign and direction checks against PDF statements.
 */
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
  sourceFilename: text("source_filename").notNull(),
  matchedTransactionId: integer("matched_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" },
  ),
  matchStatus: text("match_status").notNull().default("unmatched"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Feature modules for SaaS shell / Module Manager. */
export const appModules = sqliteTable("app_modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  href: text("href").notNull(),
  icon: text("icon").notNull().default("IconPuzzle"),
  category: text("category").notNull().default("core"), // core | finance | system
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
