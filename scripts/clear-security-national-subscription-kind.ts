/**
 * Clear Subscription kind from Security National Insurance (instance, not type).
 *
 * Usage: npx tsx scripts/clear-security-national-subscription-kind.ts [--run]
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: ".env.local" });

const APPLY = process.argv.includes("--run");

const WHERE = `
  lower(coalesce(merchant_clean,'')) LIKE '%security%national%'
  OR lower(coalesce(description,'')) LIKE '%security%national%'
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  console.log("target", url.replace(/(libsql:\/\/)[^/]+/, "$1***"));
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

  const before = await db.execute(`
    SELECT kind, count(*) AS n
    FROM transactions
    WHERE ${WHERE}
    GROUP BY kind
  `);
  console.log("before:", before.rows);

  if (APPLY) {
    const result = await db.execute({
      sql: `
        UPDATE transactions
        SET kind = NULL, kind_id = NULL, updated_at = ?
        WHERE (${WHERE})
          AND lower(coalesce(kind,'')) LIKE '%subscription%'
      `,
      args: [Date.now()],
    });
    console.log("updated rows:", result.rowsAffected);
  }

  const after = await db.execute(`
    SELECT kind, count(*) AS n
    FROM transactions
    WHERE ${WHERE}
    GROUP BY kind
  `);
  console.log("after:", after.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
