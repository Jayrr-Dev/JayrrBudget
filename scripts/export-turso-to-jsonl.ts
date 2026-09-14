/**
 * Export Turso flat ledger → JSONL for `npx convex import`.
 * Loads `.env.local` Turso credentials. Does not write Convex.
 *
 * Usage: npx tsx scripts/export-turso-to-jsonl.ts
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url?.startsWith("libsql://")) {
  console.error("DATABASE_URL must be a Turso libsql:// URL (got:", url ?? "unset", ")");
  process.exit(1);
}

console.log("Export source:", url.replace(/\/\/.*@/, "//***@"));

const client = createClient({ url, authToken });
const outDir = join(process.cwd(), "data", "convex-export");
mkdirSync(outDir, { recursive: true });

function ms(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function bool(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

async function exportTable(
  name: string,
  sql: string,
  mapRow: (row: Record<string, unknown>) => Record<string, unknown>,
) {
  const result = await client.execute(sql);
  const lines: string[] = [];
  for (const row of result.rows) {
    const mapped = mapRow(row as unknown as Record<string, unknown>);
    lines.push(JSON.stringify(mapped));
  }
  const path = join(outDir, `${name}.jsonl`);
  writeFileSync(path, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  console.log(`${name}: ${lines.length} → ${path}`);
  return lines.length;
}

async function main() {
  const counts: Record<string, number> = {};

  counts.institutions = await exportTable(
    "institutions",
    `SELECT institution_id, name, created_at, updated_at FROM institutions`,
    (r) => ({
      institutionId: String(r.institution_id),
      name: str(r.name),
      createdAt: ms(r.created_at) ?? Date.now(),
      updatedAt: ms(r.updated_at) ?? Date.now(),
    }),
  );

  counts.accounts = await exportTable(
    "accounts",
    `SELECT account_id, institution_id, name, official_name, mask, type, subtype,
            current_balance, available_balance, iso_currency_code, updated_at
     FROM accounts`,
    (r) => ({
      accountId: String(r.account_id),
      institutionId: String(r.institution_id),
      name: String(r.name),
      officialName: str(r.official_name),
      mask: str(r.mask),
      type: str(r.type),
      subtype: str(r.subtype),
      currentBalance: num(r.current_balance),
      availableBalance: num(r.available_balance),
      isoCurrencyCode: str(r.iso_currency_code),
      updatedAt: ms(r.updated_at) ?? Date.now(),
    }),
  );

  counts.transactionSections = await exportTable(
    "transactionSections",
    `SELECT id, name FROM transaction_sections`,
    (r) => ({
      legacyId: Number(r.id),
      name: String(r.name),
    }),
  );

  counts.transactionSpreads = await exportTable(
    "transactionSpreads",
    `SELECT id, name, target_percent, description, sort_order FROM transaction_spreads`,
    (r) => ({
      legacyId: Number(r.id),
      name: String(r.name),
      targetPercent: Number(r.target_percent ?? 0),
      description: String(r.description ?? ""),
      sortOrder: Number(r.sort_order ?? 0),
    }),
  );

  counts.transactionCategories = await exportTable(
    "transactionCategories",
    `SELECT id, name, section_id FROM transaction_categories`,
    (r) => ({
      legacyId: Number(r.id),
      name: String(r.name),
      sectionLegacyId: num(r.section_id),
    }),
  );

  counts.transactionSubcategories = await exportTable(
    "transactionSubcategories",
    `SELECT id, name, category_id FROM transaction_subcategories`,
    (r) => ({
      legacyId: Number(r.id),
      name: String(r.name),
      categoryLegacyId: num(r.category_id),
    }),
  );

  counts.transactionTypes = await exportTable(
    "transactionTypes",
    `SELECT id, name FROM transaction_types`,
    (r) => ({
      legacyId: Number(r.id),
      name: String(r.name),
    }),
  );

  counts.transactionKinds = await exportTable(
    "transactionKinds",
    `SELECT id, name FROM transaction_kinds`,
    (r) => ({
      legacyId: Number(r.id),
      name: String(r.name),
    }),
  );

  counts.transactions = await exportTable(
    "transactions",
    `SELECT * FROM transactions`,
    (r) => ({
      transactionId: String(r.transaction_id),
      posted: String(r.posted),
      authorized: str(r.authorized),
      account: str(r.account),
      accountId: String(r.account_id),
      description: String(r.description),
      originalDescription: str(r.original_description),
      merchantClean: str(r.merchant_clean),
      merchantName: str(r.merchant_name),
      company: str(r.company),
      brand: str(r.brand),
      section: str(r.section),
      category: str(r.category),
      subcategory: str(r.subcategory),
      spread: str(r.spread),
      transactionType: str(r.transaction_type),
      kind: str(r.kind),
      sectionLegacyId: num(r.section_id),
      categoryLegacyId: num(r.category_id),
      subcategoryLegacyId: num(r.subcategory_id),
      spreadLegacyId: num(r.spread_id),
      transactionTypeLegacyId: num(r.transaction_type_id),
      kindLegacyId: num(r.kind_id),
      categoryPrimary: str(r.category_primary),
      categoryDetailed: str(r.category_detailed),
      categoryConfidence: str(r.category_confidence),
      tags: str(r.tags),
      channel: str(r.channel),
      txnCode: str(r.txn_code),
      bankDirection: str(r.bank_direction),
      crossCheck: str(r.cross_check),
      enrichment: str(r.enrichment),
      source: str(r.source),
      pending: Boolean(r.pending),
      city: str(r.city),
      region: str(r.region),
      country: str(r.country),
      website: str(r.website),
      logoUrl: str(r.logo_url),
      currency: String(r.currency ?? "CAD"),
      debit: num(r.debit),
      credit: num(r.credit),
      amount: Number(r.amount),
      updatedAt: ms(r.updated_at) ?? Date.now(),
    }),
  );

  counts.loanTerms = await exportTable(
    "loanTerms",
    `SELECT * FROM loan_terms`,
    (r) => ({
      accountId: String(r.account_id),
      principalStart: Number(r.principal_start),
      annualRate: Number(r.annual_rate),
      aprDisclosed: num(r.apr_disclosed),
      paymentAmount: Number(r.payment_amount),
      paymentFrequency: String(r.payment_frequency ?? "biweekly"),
      paymentCount: Number(r.payment_count),
      firstPaymentDate: String(r.first_payment_date),
      maturityDate: String(r.maturity_date),
      matchMerchantClean: String(r.match_merchant_clean),
      matchAmount: Number(r.match_amount),
      principalOverride: num(r.principal_override),
      overrideAsOf: str(r.override_as_of),
      vehicleLabel: str(r.vehicle_label),
      updatedAt: ms(r.updated_at) ?? Date.now(),
    }),
  );

  counts.loanPaymentLinks = await exportTable(
    "loanPaymentLinks",
    `SELECT * FROM loan_payment_links`,
    (r) => ({
      loanAccountId: String(r.loan_account_id),
      paymentNumber: Number(r.payment_number),
      scheduledDate: String(r.scheduled_date),
      postedDate: str(r.posted_date),
      transactionId: str(r.transaction_id),
      paymentAmount: Number(r.payment_amount),
      interestPortion: Number(r.interest_portion),
      principalPortion: Number(r.principal_portion),
      balanceAfter: Number(r.balance_after),
    }),
  );

  // OCR markdown omitted (File Storage follow-up); keep metadata + hasOcr flag via null ocr.
  counts.statementUploads = await exportTable(
    "statementUploads",
    `SELECT * FROM statement_uploads`,
    (r) => ({
      uploadId: Number(r.id),
      filename: String(r.filename),
      fileHash: str(r.file_hash),
      status: String(r.status ?? "pending"),
      accountId: str(r.account_id),
      institutionName: str(r.institution_name),
      accountName: str(r.account_name),
      accountMask: str(r.account_mask),
      currency: str(r.currency),
      pageCount: num(r.page_count),
      transactionCount: num(r.transaction_count),
      insertedCount: num(r.inserted_count),
      updatedCount: num(r.updated_count),
      skippedCount: num(r.skipped_count),
      statementPeriodStart: str(r.statement_period_start),
      statementPeriodEnd: str(r.statement_period_end),
      openingBalance: num(r.opening_balance),
      closingBalance: num(r.closing_balance),
      totalDebits: num(r.total_debits),
      totalCredits: num(r.total_credits),
      transactionSum: num(r.transaction_sum),
      computedClosing: num(r.computed_closing),
      balanceDelta: num(r.balance_delta),
      balanceOk: bool(r.balance_ok),
      ocrMarkdown: null,
      error: str(r.error),
      createdAt: ms(r.created_at) ?? Date.now(),
      completedAt: ms(r.completed_at),
    }),
  );

  counts.appModules = await exportTable(
    "appModules",
    `SELECT * FROM app_modules`,
    (r) => ({
      legacyId: Number(r.id),
      slug: String(r.slug),
      name: String(r.name),
      description: str(r.description),
      href: String(r.href),
      icon: String(r.icon ?? "IconPuzzle"),
      category: String(r.category ?? "core"),
      enabled: Boolean(r.enabled),
      sortOrder: Number(r.sort_order ?? 0),
      isCore: Boolean(r.is_core),
      createdAt: ms(r.created_at) ?? Date.now(),
      updatedAt: ms(r.updated_at) ?? Date.now(),
    }),
  );

  writeFileSync(
    join(outDir, "_counts.json"),
    JSON.stringify(counts, null, 2) + "\n",
    "utf8",
  );
  console.log("Done. Counts:", counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
