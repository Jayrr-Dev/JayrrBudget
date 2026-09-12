/**
 * Add tag "Support" to all Global Money Transfer transactions.
 * Usage: npx tsx scripts/tag-support-global-money.ts [--run]
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
config({ path: ".env.local" });

const APPLY = process.argv.includes("--run");
const TAG = "Support";

function splitTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.length ? out.join(", ") : null;
}

function hasTag(tags: string[], name: string) {
  return tags.some((t) => t.toLowerCase() === name.toLowerCase());
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");
  console.log(`DB: ${url.replace(/\/\/.*@/, "//***@")}`);

  const matchSql = `
    lower(coalesce(merchant_clean, '')) LIKE '%global%money%transfer%'
    OR lower(coalesce(merchant_name, '')) LIKE '%global%money%transfer%'
    OR lower(coalesce(description, '')) LIKE '%global%money%transfer%'
    OR lower(coalesce(original_description, '')) LIKE '%global%money%transfer%'
    OR lower(coalesce(merchant_clean, '')) LIKE '%cibc%global%money%'
    OR lower(coalesce(merchant_name, '')) LIKE '%cibc%global%money%'
    OR lower(coalesce(description, '')) LIKE '%cibc%global%money%'
    OR lower(coalesce(original_description, '')) LIKE '%cibc%global%money%'
  `;

  const rows = await db.execute(`
    SELECT id, posted, merchant_clean, merchant_name, description, category, subcategory, tags, amount
    FROM transactions
    WHERE ${matchSql}
    ORDER BY posted DESC
  `);
  console.log(`Global Money Transfer matches: ${rows.rows.length}`);

  let already = 0;
  let toAdd = 0;
  for (const row of rows.rows) {
    const tags = splitTags(row.tags == null ? null : String(row.tags));
    if (hasTag(tags, TAG)) {
      already += 1;
      continue;
    }
    toAdd += 1;
    tags.push(TAG);
    const next = joinTags(tags);
    const label =
      row.merchant_clean ||
      row.merchant_name ||
      row.description ||
      "(no label)";
    console.log(
      `${APPLY ? "ADD" : "WOULD ADD"} ${row.posted} | ${row.amount} | ${label} | ${row.tags ?? "(none)"} -> ${next}`,
    );
    if (APPLY) {
      await db.execute({
        sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
        args: [next, Date.now(), row.id],
      });
    }
  }

  console.log(`already had ${TAG}: ${already}`);
  console.log(`${APPLY ? "added" : "would add"} ${TAG}: ${toAdd}`);

  if (APPLY) {
    const check = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE (${matchSql})
      AND (
        lower(coalesce(tags,'')) = 'support'
        OR lower(coalesce(tags,'')) LIKE 'support,%'
        OR lower(coalesce(tags,'')) LIKE '%, support'
        OR lower(coalesce(tags,'')) LIKE '%, support,%'
      )
    `);
    console.log(
      `Global Money Transfer rows with Support tag: ${check.rows[0]?.c}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
