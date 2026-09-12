/**
 * Consolidate Developer Tools / Web Development kinds → "Dev Tools".
 *
 *   npx tsx scripts/consolidate-dev-tools-kind.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const RENAMES: Array<{ from: string; to: string }> = [
  { from: "Developer Tools; Web Development", to: "Dev Tools" },
  {
    from: "Developer Tools; Subscription; Web Development",
    to: "Dev Tools; Subscription",
  },
  { from: "AI; Subscription; Web Development", to: "AI; Subscription" },
];

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (!url) throw new Error("DATABASE_URL missing");
  if (url.startsWith("file:")) throw new Error("Refusing file: DATABASE_URL");
  console.log("target", url.replace(/(libsql:\/\/)[^/]+/, "$1***"));

  const c = createClient({ url, authToken });

  const before = await c.execute(`
    SELECT kind, count(*) AS n
    FROM transactions
    WHERE kind IN (
      'Developer Tools; Web Development',
      'Developer Tools; Subscription; Web Development',
      'AI; Subscription; Web Development',
      'Dev Tools',
      'Dev Tools; Subscription',
      'AI; Subscription'
    )
    GROUP BY kind
    ORDER BY kind
  `);
  console.log("before", before.rows);

  for (const { from, to } of RENAMES) {
    // Ensure lookup row exists
    await c.execute({
      sql: `INSERT INTO transaction_kinds (name)
            SELECT ?
            WHERE NOT EXISTS (SELECT 1 FROM transaction_kinds WHERE name = ?)`,
      args: [to, to],
    });
    const idRow = await c.execute({
      sql: `SELECT id FROM transaction_kinds WHERE name = ? LIMIT 1`,
      args: [to],
    });
    const kindId = idRow.rows[0]?.id ?? null;

    const upd = await c.execute({
      sql: `UPDATE transactions
            SET kind = ?, kind_id = ?
            WHERE kind = ?`,
      args: [to, kindId, from],
    });
    console.log(`rename ${from} → ${to}: ${upd.rowsAffected ?? "ok"}`);

    await c.execute({
      sql: `DELETE FROM transaction_kinds
            WHERE name = ?
              AND NOT EXISTS (SELECT 1 FROM transactions WHERE kind = ?)`,
      args: [from, from],
    });
  }

  const after = await c.execute(`
    SELECT kind, count(*) AS n
    FROM transactions
    WHERE kind LIKE '%Developer%'
       OR kind LIKE '%Web Development%'
       OR kind LIKE '%Dev Tools%'
       OR kind LIKE 'AI; Subscription%'
    GROUP BY kind
    ORDER BY kind
  `);
  console.log("after", after.rows);
  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
