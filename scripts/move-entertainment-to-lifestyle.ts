/**
 * Entertainment & Travel section → Lifestyle (keep category/subcategory).
 *
 * Usage: npx tsx scripts/move-entertainment-to-lifestyle.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type Client } from "@libsql/client";

const APPLY = process.argv.includes("--run");
const SOURCE_SECTION = "Entertainment & Travel";

async function ensure(db: Client, table: string, name: string) {
  const hit = await db.execute({
    sql: `SELECT id FROM ${table} WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (hit.rows[0]?.id != null) return Number(hit.rows[0].id);
  if (!APPLY) return -1;
  const ins = await db.execute({
    sql: `INSERT INTO ${table} (name) VALUES (?)`,
    args: [name],
  });
  return Number(ins.lastInsertRowid);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const where = `section = ?`;

  const total = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM transactions WHERE ${where}`,
    args: [SOURCE_SECTION],
  });
  const before = await db.execute({
    sql: `
      SELECT section, category, subcategory, COUNT(*) AS c
      FROM transactions
      WHERE ${where}
      GROUP BY 1, 2, 3
      ORDER BY c DESC
    `,
    args: [SOURCE_SECTION],
  });
  console.log(`${SOURCE_SECTION} rows: ${total.rows[0]?.c}`);
  console.log("before:", before.rows);

  const lifestyleId = await ensure(db, "transaction_sections", "Lifestyle");

  if (APPLY && Number(total.rows[0]?.c ?? 0) > 0) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Lifestyle',
            section_id = ?,
            updated_at = ?
        WHERE ${where}
      `,
      args: [
        lifestyleId > 0 ? lifestyleId : null,
        Date.now(),
        SOURCE_SECTION,
      ],
    });
  }

  const left = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM transactions WHERE section = ?`,
    args: [SOURCE_SECTION],
  });
  const cats = [
    ...new Set(
      before.rows.map((r) => String(r.category ?? "")).filter(Boolean),
    ),
  ];
  console.log(`${SOURCE_SECTION} left: ${left.rows[0]?.c}`);
  if (cats.length) {
    const placeholders = cats.map(() => "?").join(", ");
    const after = await db.execute({
      sql: `
        SELECT section, category, subcategory, COUNT(*) AS c
        FROM transactions
        WHERE section = 'Lifestyle' AND category IN (${placeholders})
        GROUP BY 1, 2, 3
        ORDER BY c DESC
      `,
      args: cats,
    });
    console.log("now under Lifestyle:", after.rows);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
