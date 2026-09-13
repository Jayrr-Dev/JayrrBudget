import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

async function main() {
  const db = createClient({ url: process.env.DATABASE_URL! });

  for (const t of [
    "accounts",
    "institutions",
    "transaction_locations",
    "transaction_payment_refs",
    "transaction_entities",
    "entities",
  ]) {
    const cols = await db.execute(`PRAGMA table_info(${t})`);
    const cnt = await db.execute(`SELECT COUNT(*) c FROM ${t}`);
    console.log(
      t,
      "c=" + cnt.rows[0]?.c,
      cols.rows.map((r) => r.name).join(","),
    );
  }

  const facets = await db.execute(
    `SELECT facet, COUNT(*) c FROM taxonomy_nodes GROUP BY facet ORDER BY facet`,
  );
  console.log("facets", facets.rows);

  const roles = await db.execute(
    `SELECT role, COUNT(*) c FROM transaction_labels GROUP BY role ORDER BY role`,
  );
  console.log("roles", roles.rows);

  const sample = await db.execute(`
    SELECT t.id, t.transaction_id, t.description, t.account_id, t.pending, t.source,
           td.posted_date, td.authorized_date,
           ta.amount_minor, ta.currency_code,
           te.merchant_clean, te.merchant_raw, te.channel, te.txn_kind, te.enrichment_status,
           tbc.category_primary, tbc.category_detailed, tbc.category_confidence
    FROM transactions t
    LEFT JOIN transaction_dates td ON td.transaction_id = t.id
    LEFT JOIN transaction_amounts ta ON ta.transaction_id = t.id
    LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
    LEFT JOIN transaction_bank_categories tbc ON tbc.transaction_id = t.id
    LIMIT 2
  `);
  console.log("sample", JSON.stringify(sample.rows, null, 2));

  const labels = await db.execute(`
    SELECT tl.transaction_id, tl.role, tn.facet, tn.name, tn.slug
    FROM transaction_labels tl
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE tl.transaction_id = (SELECT id FROM transactions LIMIT 1)
  `);
  console.log("labels_for_one", labels.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
