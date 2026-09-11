/**
 * Strip Travel / trip tags from Student Loans transactions.
 * Usage: npx tsx scripts/strip-student-loan-trip-tags.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");

const TRIP_TAG_RE =
  /^(travel|philippines\s*trip\s*2026|new\s*york\s*2026|.*\btrip\b.*)$/i;

function splitTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]): string | null {
  return tags.length ? tags.join(", ") : null;
}

function isTripTag(tag: string) {
  return TRIP_TAG_RE.test(tag.trim());
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const where = `
    subcategory = 'Student Loans'
    OR lower(coalesce(merchant_clean,'')) LIKE '%student loan%'
    OR lower(coalesce(description,'')) LIKE '%student loan%'
    OR lower(coalesce(merchant_clean,'')) LIKE '%abdl%'
    OR lower(coalesce(merchant_clean,'')) LIKE '%nsLsc%'
  `;

  const rows = await db.execute(`
    SELECT id, posted, merchant_clean, subcategory, tags
    FROM transactions
    WHERE (${where})
      AND tags IS NOT NULL
      AND trim(tags) != ''
    ORDER BY posted DESC
  `);

  console.log(`tagged student-loan-ish rows: ${rows.rows.length}`);
  let wouldUpdate = 0;
  for (const row of rows.rows) {
    const before = splitTags(String(row.tags ?? ""));
    const after = before.filter((t) => !isTripTag(t));
    const removed = before.filter((t) => isTripTag(t));
    if (removed.length === 0) continue;
    wouldUpdate += 1;
    console.log({
      id: row.id,
      posted: row.posted,
      merchant_clean: row.merchant_clean,
      before,
      remove: removed,
      after,
    });
    if (APPLY) {
      await db.execute({
        sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
        args: [joinTags(after), Date.now(), row.id],
      });
    }
  }
  console.log(`rows to clear trip tags: ${wouldUpdate}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
