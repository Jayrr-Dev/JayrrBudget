/**
 * Travel tag window + Philippines trip tag.
 *
 * Window: 2026-02-25 .. 2026-04-05
 * - Outside: remove Travel tag
 * - Inside: ensure Travel + "Philippines Trip 2020" on ALL txns
 *
 * Usage: npx tsx scripts/philippines-trip-tags.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const APPLY = process.argv.includes("--run");
const START = "2026-02-25";
const END = "2026-04-05";
const TRIP_TAG = "Philippines Trip 2020";

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
  const key = name.toLowerCase();
  return tags.some((t) => t.toLowerCase() === key);
}

function removeTag(tags: string[], name: string) {
  const key = name.toLowerCase();
  return tags.filter((t) => t.toLowerCase() !== key);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");
  console.log(`window: ${START} .. ${END}`);
  console.log(`trip tag: ${TRIP_TAG}`);

  let removeTravel = 0;
  let addTravel = 0;
  let addTrip = 0;
  let inWindow = 0;

  if (APPLY) {
    const outside = await db.execute(`
      SELECT id, tags FROM transactions
      WHERE NOT (posted >= '${START}' AND posted <= '${END}')
        AND (
          lower(coalesce(tags,'')) = 'travel'
          OR lower(coalesce(tags,'')) LIKE 'travel,%'
          OR lower(coalesce(tags,'')) LIKE '%, travel'
          OR lower(coalesce(tags,'')) LIKE '%, travel,%'
          OR coalesce(tags,'') LIKE '%Philippines Trip 2020%'
        )
    `);
    console.log(`outside window to clean: ${outside.rows.length}`);
    for (const row of outside.rows) {
      let tags = splitTags(String(row.tags ?? ""));
      const before = tags.join("|");
      tags = removeTag(tags, "Travel");
      tags = removeTag(tags, TRIP_TAG);
      if (tags.join("|") === before) continue;
      await db.execute({
        sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
        args: [joinTags(tags), Date.now(), row.id],
      });
      removeTravel += 1;
    }

    const inside = await db.execute(`
      SELECT id, tags FROM transactions
      WHERE posted >= '${START}' AND posted <= '${END}'
    `);
    inWindow = inside.rows.length;
    for (const row of inside.rows) {
      let tags = splitTags(row.tags == null ? null : String(row.tags));
      let changed = false;
      if (!hasTag(tags, "Travel")) {
        tags.push("Travel");
        addTravel += 1;
        changed = true;
      }
      if (!hasTag(tags, TRIP_TAG)) {
        tags.push(TRIP_TAG);
        addTrip += 1;
        changed = true;
      }
      if (changed) {
        await db.execute({
          sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
          args: [joinTags(tags), Date.now(), row.id],
        });
      }
    }
  } else {
    const outside = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE NOT (posted >= '${START}' AND posted <= '${END}')
        AND (
          lower(coalesce(tags,'')) = 'travel'
          OR lower(coalesce(tags,'')) LIKE 'travel,%'
          OR lower(coalesce(tags,'')) LIKE '%, travel'
          OR lower(coalesce(tags,'')) LIKE '%, travel,%'
        )
    `);
    const inside = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE posted >= '${START}' AND posted <= '${END}'
    `);
    removeTravel = Number(outside.rows[0]?.c ?? 0);
    inWindow = Number(inside.rows[0]?.c ?? 0);
    const needTravel = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE posted >= '${START}' AND posted <= '${END}'
        AND NOT (
          lower(coalesce(tags,'')) = 'travel'
          OR lower(coalesce(tags,'')) LIKE 'travel,%'
          OR lower(coalesce(tags,'')) LIKE '%, travel'
          OR lower(coalesce(tags,'')) LIKE '%, travel,%'
        )
    `);
    const needTrip = await db.execute(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE posted >= '${START}' AND posted <= '${END}'
        AND (tags IS NULL OR tags NOT LIKE '%Philippines Trip 2020%')
    `);
    addTravel = Number(needTravel.rows[0]?.c ?? 0);
    addTrip = Number(needTrip.rows[0]?.c ?? 0);
  }

  console.log(`in window: ${inWindow}`);
  console.log(
    `${APPLY ? "removed" : "would remove"} Travel outside: ${removeTravel}`,
  );
  console.log(
    `${APPLY ? "added" : "would add"} Travel inside: ${addTravel}`,
  );
  console.log(
    `${APPLY ? "added" : "would add"} "${TRIP_TAG}" inside: ${addTrip}`,
  );

  if (APPLY) {
    const check = await db.execute(`
      SELECT
        SUM(CASE WHEN posted >= '${START}' AND posted <= '${END}'
          AND (
            lower(coalesce(tags,'')) = 'travel'
            OR lower(coalesce(tags,'')) LIKE 'travel,%'
            OR lower(coalesce(tags,'')) LIKE '%, travel'
            OR lower(coalesce(tags,'')) LIKE '%, travel,%'
          ) THEN 1 ELSE 0 END) AS travel_in,
        SUM(CASE WHEN NOT (posted >= '${START}' AND posted <= '${END}')
          AND (
            lower(coalesce(tags,'')) = 'travel'
            OR lower(coalesce(tags,'')) LIKE 'travel,%'
            OR lower(coalesce(tags,'')) LIKE '%, travel'
            OR lower(coalesce(tags,'')) LIKE '%, travel,%'
          ) THEN 1 ELSE 0 END) AS travel_out,
        SUM(CASE WHEN posted >= '${START}' AND posted <= '${END}'
          AND tags LIKE '%Philippines Trip 2020%' THEN 1 ELSE 0 END) AS trip_in,
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
