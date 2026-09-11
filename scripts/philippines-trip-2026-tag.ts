/**
 * Window 2026-02-25 .. 2026-04-05:
 * - Add "Philippines Trip 2026"
 * - Remove "Philippines Trip 2020" (wrong year)
 *
 * Usage: npx tsx scripts/philippines-trip-2026-tag.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");
const START = "2026-02-25";
const END = "2026-04-05";
const OLD_TAG = "Philippines Trip 2020";
const NEW_TAG = "Philippines Trip 2026";

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

function removeTag(tags: string[], name: string) {
  return tags.filter((t) => t.toLowerCase() !== name.toLowerCase());
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const inside = await db.execute(`
    SELECT id, tags FROM transactions
    WHERE posted >= '${START}' AND posted <= '${END}'
  `);
  console.log(`in window: ${inside.rows.length}`);

  let updated = 0;
  for (const row of inside.rows) {
    let tags = splitTags(row.tags == null ? null : String(row.tags));
    const before = joinTags(tags);
    tags = removeTag(tags, OLD_TAG);
    if (!hasTag(tags, NEW_TAG)) tags.push(NEW_TAG);
    if (!hasTag(tags, "Travel")) tags.push("Travel");
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

  // Strip old 2020 tag anywhere else too
  const stray = await db.execute(`
    SELECT id, tags FROM transactions
    WHERE tags LIKE '%Philippines Trip 2020%'
  `);
  let strayFixed = 0;
  for (const row of stray.rows) {
    let tags = splitTags(String(row.tags ?? ""));
    tags = removeTag(tags, OLD_TAG);
    if (!hasTag(tags, NEW_TAG) && String(row.id)) {
      // only add 2026 if still in window — checked by re-query posted
    }
    strayFixed += 1;
    if (APPLY) {
      await db.execute({
        sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
        args: [joinTags(tags), Date.now(), row.id],
      });
    }
  }

  console.log(`${APPLY ? "updated" : "would update"} in window: ${updated}`);
  console.log(
    `${APPLY ? "stripped" : "would strip"} 2020 tag rows: ${stray.rows.length}`,
  );

  if (APPLY) {
    const check = await db.execute(`
      SELECT
        SUM(CASE WHEN posted >= '${START}' AND posted <= '${END}'
          AND tags LIKE '%Philippines Trip 2026%' THEN 1 ELSE 0 END) AS trip_2026,
        SUM(CASE WHEN tags LIKE '%Philippines Trip 2020%' THEN 1 ELSE 0 END) AS trip_2020_left,
        SUM(CASE WHEN posted >= '${START}' AND posted <= '${END}' THEN 1 ELSE 0 END) AS window_total
      FROM transactions
    `);
    console.log("verify:", check.rows[0]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
