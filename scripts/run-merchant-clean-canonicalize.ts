import { config } from "dotenv";
config({ path: ".env.local" });

import { applyCompanyEntities } from "../src/domains/enrichment/application/applyCompanyEntities";
import { applyMerchantCleanCanonicalize } from "../src/domains/enrichment/application/applyMerchantCleanCanonicalize";
import { getDb } from "../src/shared/db";
import { transactionEnrichment } from "../src/shared/db/schema";

async function distinctMerchantCleanCount() {
  const db = getDb();
  const rows = await db
    .select({ merchantClean: transactionEnrichment.merchantClean })
    .from(transactionEnrichment);
  return new Set(
    rows
      .map((row) => row.merchantClean?.trim())
      .filter((value): value is string => Boolean(value)),
  ).size;
}

async function main() {
  const before = await distinctMerchantCleanCount();
  console.log(`merchantClean distinct before=${before}`);

  const result = await applyMerchantCleanCanonicalize();
  console.log(
    `canonicalize scanned=${result.scanned} rowsUpdated=${result.rowsUpdated} mergePairs=${result.mergePairs}`,
  );
  for (const sample of result.samples.slice(0, 40)) {
    console.log(`  ${sample.from} => ${sample.to} (rows=${sample.rows})`);
  }
  if (result.samples.length > 40) {
    console.log(`  ... +${result.samples.length - 40} more pairs`);
  }

  const after = await distinctMerchantCleanCount();
  console.log(`merchantClean distinct after=${after} (delta=${after - before})`);

  console.log("company entities pass...");
  const companies = await applyCompanyEntities();
  console.log(JSON.stringify(companies, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
