import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const plaidItems = sqliteTable("plaid_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: text("item_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  cursor: text("cursor"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plaidAccountId: text("plaid_account_id").notNull().unique(),
  itemId: text("item_id")
    .notNull()
    .references(() => plaidItems.itemId, { onDelete: "cascade" }),
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

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plaidTransactionId: text("plaid_transaction_id").notNull().unique(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.plaidAccountId, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => plaidItems.itemId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  merchantName: text("merchant_name"),
  amount: real("amount").notNull(),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  date: text("date").notNull(),
  authorizedDate: text("authorized_date"),
  pending: integer("pending", { mode: "boolean" }).notNull().default(false),
  categoryPrimary: text("category_primary"),
  categoryDetailed: text("category_detailed"),
  paymentChannel: text("payment_channel"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
