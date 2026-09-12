/**
 * Rename PLC INTEREST CHARGED merchant_clean → CIBC Line of Credit.
 *
 *   npx tsx scripts/fix-plc-interest-merchant.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const TARGET = "CIBC Line of Credit";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (!url) throw new Error("DATABASE_URL missing");
  if (url.startsWith("file:")) throw new Error("Refusing file: DATABASE_URL");
  console.log("target", url.replace(/(libsql:\/\/)[^/]+/, "$1***"));

  const c = createClient({ url, authToken });

  const before = await c.execute(`
    SELECT merchant_clean, count(*) AS n
    FROM transactions
    WHERE upper(description) LIKE '%PLC INTEREST CHARGED%'
    GROUP BY merchant_clean
  `);
  console.log("before", before.rows);

  const upd = await c.execute({
    sql: `
      UPDATE transactions
      SET merchant_clean = ?,
          merchant_name = COALESCE(merchant_name, ?),
          company = COALESCE(company, 'CIBC')
      WHERE upper(description) LIKE '%PLC INTEREST CHARGED%'
    `,
    args: [TARGET, TARGET],
  });
  console.log("rowsAffected", upd.rowsAffected);

  const after = await c.execute(`
    SELECT id, posted, description, amount, merchant_clean, company
    FROM transactions
    WHERE upper(description) LIKE '%PLC INTEREST CHARGED%'
    ORDER BY posted DESC
  `);
  console.log("after count", after.rows.length);
  console.log(
    "sample",
    after.rows.slice(0, 3).map((r) => ({
      posted: r.posted,
      amount: r.amount,
      merchant_clean: r.merchant_clean,
    })),
  );

  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
