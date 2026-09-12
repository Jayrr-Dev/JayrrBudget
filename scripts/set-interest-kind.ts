/**
 * Set kind = Interest on interest-related transactions (drop Fee).
 *
 *   npx tsx scripts/set-interest-kind.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { joinTags, splitTags } from "../src/domains/transactions/domain/tags";

const INTEREST = "Interest";
const DROP_FROM_KIND = new Set(["fee"]);

function rewriteKind(raw: string | null | undefined): string {
  const parts = splitTags(raw ?? "").filter(
    (p) => !DROP_FROM_KIND.has(p.toLowerCase()),
  );
  if (!parts.some((p) => p.toLowerCase() === "interest")) {
    parts.push(INTEREST);
  }
  return joinTags(parts)?.replace(/, /g, "; ") ?? INTEREST;
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (!url) throw new Error("DATABASE_URL missing");
  if (url.startsWith("file:")) throw new Error("Refusing file: DATABASE_URL");
  console.log("target", url.replace(/(libsql:\/\/)[^/]+/, "$1***"));

  const c = createClient({ url, authToken });

  await c.execute({
    sql: `INSERT INTO transaction_kinds (name)
          SELECT ?
          WHERE NOT EXISTS (SELECT 1 FROM transaction_kinds WHERE name = ?)`,
    args: [INTEREST, INTEREST],
  });
  const idRow = await c.execute({
    sql: `SELECT id FROM transaction_kinds WHERE name = ? LIMIT 1`,
    args: [INTEREST],
  });
  const interestId = Number(idRow.rows[0]?.id);
  console.log("Interest kind id", interestId);

  const candidates = await c.execute(`
    SELECT id, kind, description, merchant_clean, subcategory
    FROM transactions
    WHERE upper(description) LIKE '%INTEREST%'
       OR upper(coalesce(merchant_clean,'')) LIKE '%INTEREST%'
       OR upper(coalesce(subcategory,'')) LIKE '%INTEREST%'
       OR upper(coalesce(kind,'')) LIKE '%INTEREST%'
  `);
  console.log("candidates", candidates.rows.length);

  const kindIdCache = new Map<string, number>([[INTEREST, interestId]]);
  async function ensureKindId(name: string): Promise<number> {
    const hit = kindIdCache.get(name);
    if (hit != null) return hit;
    await c.execute({
      sql: `INSERT INTO transaction_kinds (name)
            SELECT ?
            WHERE NOT EXISTS (SELECT 1 FROM transaction_kinds WHERE name = ?)`,
      args: [name, name],
    });
    const got = await c.execute({
      sql: `SELECT id FROM transaction_kinds WHERE name = ? LIMIT 1`,
      args: [name],
    });
    const id = Number(got.rows[0]?.id);
    kindIdCache.set(name, id);
    return id;
  }

  let updated = 0;
  const BATCH = 40;
  for (let i = 0; i < candidates.rows.length; i += BATCH) {
    const chunk = candidates.rows.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (row) => {
        const kind = rewriteKind(String(row.kind ?? ""));
        const kindId = await ensureKindId(kind);
        await c.execute({
          sql: `UPDATE transactions SET kind = ?, kind_id = ? WHERE id = ?`,
          args: [kind, kindId, Number(row.id)],
        });
      }),
    );
    updated += chunk.length;
    console.log(`updated ${updated}/${candidates.rows.length}`);
  }

  const after = await c.execute(`
    SELECT kind, count(*) AS n
    FROM transactions
    WHERE upper(description) LIKE '%INTEREST%'
       OR upper(coalesce(merchant_clean,'')) LIKE '%INTEREST%'
       OR upper(coalesce(subcategory,'')) LIKE '%INTEREST%'
    GROUP BY kind
    ORDER BY n DESC
  `);
  console.log("after", after.rows);

  const plc = await c.execute(`
    SELECT kind, count(*) AS n
    FROM transactions
    WHERE upper(description) LIKE '%PLC INTEREST CHARGED%'
    GROUP BY kind
  `);
  console.log("plc after", plc.rows);

  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
