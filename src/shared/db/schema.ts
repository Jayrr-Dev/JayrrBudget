import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Flat ledger (CSV-shaped) + small lookup tables for filterable dims.
 * One row = one transaction. No atom/enrichment side tables.
 */

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
  isoCurrencyCode: text("iso_currency_code").default("CAD"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** 1:1 synthetic amortizing loan contract (e.g. CIBC car loan). */
export const loanTerms = sqliteTable("loan_terms", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  principalStart: real("principal_start").notNull(),
  annualRate: real("annual_rate").notNull(),
  aprDisclosed: real("apr_disclosed"),
  paymentAmount: real("payment_amount").notNull(),
  paymentFrequency: text("payment_frequency").notNull().default("biweekly"),
  paymentCount: integer("payment_count").notNull(),
  firstPaymentDate: text("first_payment_date").notNull(),
  maturityDate: text("maturity_date").notNull(),
  matchMerchantClean: text("match_merchant_clean").notNull(),
  matchAmount: real("match_amount").notNull(),
  principalOverride: real("principal_override"),
  overrideAsOf: text("override_as_of"),
  vehicleLabel: text("vehicle_label"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Schedule steps linked to optional PAD transactions. */
export const loanPaymentLinks = sqliteTable(
  "loan_payment_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loanAccountId: text("loan_account_id")
      .notNull()
      .references(() => accounts.accountId, { onDelete: "cascade" }),
    paymentNumber: integer("payment_number").notNull(),
    scheduledDate: text("scheduled_date").notNull(),
    postedDate: text("posted_date"),
    transactionId: text("transaction_id"),
    paymentAmount: real("payment_amount").notNull(),
    interestPortion: real("interest_portion").notNull(),
    principalPortion: real("principal_portion").notNull(),
    balanceAfter: real("balance_after").notNull(),
  },
  (table) => [
    uniqueIndex("loan_payment_links_account_number_uidx").on(
      table.loanAccountId,
      table.paymentNumber,
    ),
  ],
);

export const statementUploads = sqliteTable("statement_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").unique(),
  status: text("status").notNull().default("pending"),
  accountId: text("account_id").references(() => accounts.accountId, {
    onDelete: "set null",
  }),
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

/** Filter lookup: Section */
export const transactionSections = sqliteTable("transaction_sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
});

/** Filter lookup: Spread (Income + Needs / Wants / Savings) */
export const transactionSpreads = sqliteTable("transaction_spreads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  /** Target share of net pay: 50 / 30 / 20 */
  targetPercent: integer("target_percent").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Filter lookup: Category */
export const transactionCategories = sqliteTable("transaction_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  sectionId: integer("section_id").references(() => transactionSections.id, {
    onDelete: "set null",
  }),
});

/** Filter lookup: Subcategory */
export const transactionSubcategories = sqliteTable(
  "transaction_subcategories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    description: text("description"),
    categoryId: integer("category_id").references(
      () => transactionCategories.id,
      { onDelete: "set null" },
    ),
  },
);

/** Filter lookup: Transaction type (income / transfers / expenses) */
export const transactionTypes = sqliteTable("transaction_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
});

/** Filter lookup: Type (Fee, Subscription, …) */
export const transactionKinds = sqliteTable("transaction_kinds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
});

/**
 * One flat ledger row - columns match the transactions CSV export.
 * Filter dims also store FK ids when present.
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Stable fingerprint (`stmt_…`) - CSV `transactionId` */
    transactionId: text("transaction_id").notNull().unique(),

    posted: text("posted").notNull(),
    authorized: text("authorized"),
    account: text("account"),
    accountId: text("account_id").notNull(),
    description: text("description").notNull(),
    originalDescription: text("original_description"),
    merchantClean: text("merchant_clean"),
    merchantName: text("merchant_name"),
    company: text("company"),
    brand: text("brand"),

    section: text("section"),
    category: text("category"),
    subcategory: text("subcategory"),
    /** 50/30/20 bucket: Needs / Wants / Savings */
    spread: text("spread"),
    transactionType: text("transaction_type"),
    /** CSV `Type` column */
    kind: text("kind"),

    sectionId: integer("section_id").references(() => transactionSections.id, {
      onDelete: "set null",
    }),
    categoryId: integer("category_id").references(
      () => transactionCategories.id,
      { onDelete: "set null" },
    ),
    subcategoryId: integer("subcategory_id").references(
      () => transactionSubcategories.id,
      { onDelete: "set null" },
    ),
    spreadId: integer("spread_id").references(() => transactionSpreads.id, {
      onDelete: "set null",
    }),
    transactionTypeId: integer("transaction_type_id").references(
      () => transactionTypes.id,
      { onDelete: "set null" },
    ),
    kindId: integer("kind_id").references(() => transactionKinds.id, {
      onDelete: "set null",
    }),

    tags: text("tags"),
    channel: text("channel"),
    txnCode: text("txn_code"),
    bankDirection: text("bank_direction"),
    crossCheck: text("cross_check"),
    enrichment: text("enrichment"),
    source: text("source"),
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    website: text("website"),
    logoUrl: text("logo_url"),
    currency: text("currency").notNull().default("CAD"),
    debit: real("debit"),
    credit: real("credit"),
    /** Signed amount as in CSV (positive = money out). */
    amount: real("amount").notNull(),

    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("transactions_transaction_id_uidx").on(table.transactionId),
  ],
);

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
