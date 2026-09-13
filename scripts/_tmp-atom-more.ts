import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

async function main() {
  const db = createClient({ url: process.env.DATABASE_URL! });

  const entRoles = await db.execute(
    `SELECT role, COUNT(*) c FROM transaction_entities GROUP BY role`,
  );
  console.log("entity_roles", entRoles.rows);

  const entKinds = await db.execute(
    `SELECT kind, COUNT(*) c FROM entities GROUP BY kind`,
  );
  console.log("entity_kinds", entKinds.rows);

  const sample = await db.execute(`
    SELECT te.transaction_id, te.role, e.display_name, e.kind, e.website, e.logo_url
    FROM transaction_entities te
    JOIN entities e ON e.id = te.entity_id
    LIMIT 10
  `);
  console.log("entities", sample.rows);

  const amounts = await db.execute(`
    SELECT MIN(amount_minor) min_a, MAX(amount_minor) max_a,
           SUM(CASE WHEN amount_minor > 0 THEN 1 ELSE 0 END) pos,
           SUM(CASE WHEN amount_minor < 0 THEN 1 ELSE 0 END) neg,
           SUM(CASE WHEN amount_minor = 0 THEN 1 ELSE 0 END) zero
    FROM transaction_amounts
  `);
  console.log("amount_sign", amounts.rows[0]);

  const tags = await db.execute(`
    SELECT tn.name, COUNT(*) c
    FROM transaction_labels tl
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE tl.role = 'tag'
    GROUP BY tn.name
  `);
  console.log("tags", tags.rows);

  const types = await db.execute(`
    SELECT tn.name, COUNT(*) c
    FROM transaction_labels tl
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE tl.role = 'type'
    GROUP BY tn.name
    ORDER BY c DESC
    LIMIT 15
  `);
  console.log("types", types.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
