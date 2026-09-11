/**
 * Add tag "Travel" on every txn with category = Travel.
 * Usage: npx tsx scripts/tag-all-travel.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");

function hasTravelTag(tags: string | null): boolean {
  if (!tags?.trim()) return false;
  return tags
    .split(/[,|;]/)
    .map((t) => t.trim().toLowerCase())
    .includes("travel");
}

function withTravelTag(tags: string | null): string {
  if (!tags?.trim()) return "Travel";
  if (hasTravelTag(tags)) return tags.trim();
  return `${tags.trim()}, Travel`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const rows = await db.execute(`
    SELECT id, tags, section, category, subcategory
    FROM transactions
    WHERE category = 'Travel'
  `);
  console.log(`Travel category rows: ${rows.rows.length}`);

  let already = 0;
  let toAdd = 0;
  for (const row of rows.rows) {
    const tags = row.tags == null ? null : String(row.tags);
    if (hasTravelTag(tags)) {
      already += 1;
      continue;
    }
    toAdd += 1;
    if (APPLY) {
      await db.execute({
        sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
        args: [withTravelTag(tags), Date.now(), row.id],
      });
    }
  }

  console.log(`already had Travel tag: ${already}`);
  console.log(`${APPLY ? "added" : "would add"} Travel tag: ${toAdd}`);

  if (APPLY) {
    const check = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE category = 'Travel'
        AND (
          lower(coalesce(tags,'')) = 'travel'
          OR lower(coalesce(tags,'')) LIKE 'travel,%'
          OR lower(coalesce(tags,'')) LIKE '%, travel'
          OR lower(coalesce(tags,'')) LIKE '%, travel,%'
        )
    `);
    console.log(`Travel category rows with Travel tag: ${check.rows[0]?.c}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
