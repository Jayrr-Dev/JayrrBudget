/**
 * 2026-06-11 .. 2026-06-23: ensure tags Travel + New York 2026
 * Usage: npx tsx scripts/tag-new-york-2026.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");
const START = "2026-06-11";
const END = "2026-06-23";
const TAGS = ["Travel", "New York 2026"] as const;

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
  console.log(`window: ${START} .. ${END}`);

  const rows = await db.execute(`
    SELECT id, posted, tags, merchant_clean, description
    FROM transactions
    WHERE posted >= '${START}' AND posted <= '${END}'
    ORDER BY posted
  `);
  console.log(`rows in window: ${rows.rows.length}`);

  let updated = 0;
  for (const row of rows.rows) {
    let tags = splitTags(row.tags == null ? null : String(row.tags));
    const before = joinTags(tags);
    for (const tag of TAGS) {
      if (!hasTag(tags, tag)) tags.push(tag);
    }
    const after = joinTags(tags);
    if (before === after) continue;
    updated += 1;
    if (APPLY) {
      await db.execute({
        sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
        args: [after, Date.now(), row.id],
      });
    }
  }

  console.log(`${APPLY ? "updated" : "would update"}: ${updated}`);

  if (APPLY) {
    const check = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE posted >= '${START}' AND posted <= '${END}'
        AND tags LIKE '%New York 2026%'
        AND (
          lower(coalesce(tags,'')) = 'travel'
          OR lower(coalesce(tags,'')) LIKE 'travel,%'
          OR lower(coalesce(tags,'')) LIKE '%, travel'
          OR lower(coalesce(tags,'')) LIKE '%, travel,%'
        )
    `);
    console.log(`window rows with both tags: ${check.rows[0]?.c}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
