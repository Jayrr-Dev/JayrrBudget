/**
 * Audit Transport vs Travel taxonomy overlap (Turso, read-only).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

  console.log("=== sections ===");
  const sections = await db.execute(`
    SELECT id, name, slug, parent_id, path, depth
    FROM taxonomy_nodes WHERE facet = 'section'
    ORDER BY path
  `);
  for (const r of sections.rows) console.log(r);

  console.log("\n=== categories under transport / travel paths ===");
  const cats = await db.execute(`
    SELECT id, name, slug, parent_id, path,
      (SELECT COUNT(*) FROM transaction_labels tl WHERE tl.node_id = tn.id AND tl.role = 'category') AS label_n
    FROM taxonomy_nodes tn
    WHERE facet = 'category'
      AND (path LIKE 'transport%' OR path LIKE 'travel%' OR name LIKE '%Travel%' OR name LIKE '%Transit%' OR name LIKE '%Flight%' OR name LIKE '%Rideshare%' OR name LIKE '%Auto%' OR name LIKE '%Fuel%' OR name LIKE '%Lodging%' OR name LIKE '%Parking%')
    ORDER BY path
  `);
  for (const r of cats.rows) console.log(r);

  console.log("\n=== subcategories under those ===");
  const subs = await db.execute(`
    SELECT id, name, slug, parent_id, path,
      (SELECT COUNT(*) FROM transaction_labels tl WHERE tl.node_id = tn.id AND tl.role = 'subcategory') AS label_n
    FROM taxonomy_nodes tn
    WHERE facet = 'subcategory'
      AND (path LIKE 'transport%' OR path LIKE 'travel%')
    ORDER BY path
  `);
  for (const r of subs.rows) console.log(r);

  console.log("\n=== section label counts ===");
  const secLabels = await db.execute(`
    SELECT tn.name, tn.slug, tn.path, COUNT(*) AS c
    FROM transaction_labels tl
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE tl.role = 'section'
      AND (tn.slug IN ('transport','travel') OR tn.name IN ('Transport','Travel'))
    GROUP BY tn.id
  `);
  for (const r of secLabels.rows) console.log(r);

  console.log("\n=== sample Travel-section txns (category) ===");
  const travelTx = await db.execute(`
    SELECT t.description, te.merchant_clean,
      GROUP_CONCAT(CASE WHEN tl.role IN ('section','category','subcategory') THEN tl.role||':'||tn.name END, ' | ') AS tree
    FROM transactions t
    JOIN transaction_labels tl ON tl.transaction_id = t.id
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
    WHERE t.id IN (
      SELECT tl2.transaction_id FROM transaction_labels tl2
      JOIN taxonomy_nodes tn2 ON tn2.id = tl2.node_id
      WHERE tl2.role = 'section' AND tn2.slug = 'travel'
    )
    GROUP BY t.id
    LIMIT 25
  `);
  for (const r of travelTx.rows) console.log(r);

  console.log("\n=== sample Transport-section txns with travel-ish categories ===");
  const overlap = await db.execute(`
    SELECT t.description, te.merchant_clean,
      GROUP_CONCAT(CASE WHEN tl.role IN ('section','category','subcategory') THEN tl.role||':'||tn.name END, ' | ') AS tree
    FROM transactions t
    JOIN transaction_labels tl ON tl.transaction_id = t.id
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
    WHERE t.id IN (
      SELECT tl2.transaction_id FROM transaction_labels tl2
      JOIN taxonomy_nodes tn2 ON tn2.id = tl2.node_id
      WHERE tl2.role = 'category' AND tn2.slug IN ('flights','lodging','sightseeing','transit','rideshare','fuel','auto','auto-care-and-expenses')
    )
    GROUP BY t.id
    ORDER BY tree
    LIMIT 40
  `);
  for (const r of overlap.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
