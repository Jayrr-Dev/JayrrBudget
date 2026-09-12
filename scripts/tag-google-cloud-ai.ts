/**
 * Add AI tag to Google Cloud rows (user: infra spend is AI).
 *   npx tsx scripts/tag-google-cloud-ai.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import {
  hasTag,
  joinTags,
  splitTags,
} from "../src/domains/transactions/domain/tags";

const APPLY = process.argv.includes("--run");

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (!url?.startsWith("libsql://")) {
    throw new Error(`Need Turso DATABASE_URL, got ${url}`);
  }
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");
  console.log("target", url.replace(/(libsql:\/\/)[^/]+/, "$1***"));

  const c = createClient({ url, authToken });

  const rows = await c.execute(`
    SELECT id, posted,
      coalesce(merchant_clean, merchant_name, description) AS label,
      description, category, subcategory, tags, amount
    FROM transactions
    WHERE lower(coalesce(description,'')) LIKE '%google%cloud%'
       OR lower(coalesce(description,'')) LIKE '%google *cloud%'
       OR lower(coalesce(merchant_clean,'')) = 'google'
          AND category = 'Cloud & Hosting'
       OR lower(coalesce(description,'')) LIKE '%g.co/helppay%'
          AND category = 'Cloud & Hosting'
  `);

  console.log("candidates", rows.rows.length);
  let added = 0;
  let already = 0;
  const pending: Array<{ id: number; tags: string | null }> = [];

  for (const row of rows.rows) {
    const tags = splitTags(row.tags == null ? null : String(row.tags));
    if (hasTag(tags, "AI")) {
      already += 1;
      continue;
    }
    // Only Cloud & Hosting Google rows (not Google One)
    const desc = String(row.description ?? "");
    const isCloud =
      /google\s*\*?\s*cloud/i.test(desc) ||
      (row.category === "Cloud & Hosting" &&
        String(row.label ?? "").toLowerCase() === "google");
    if (!isCloud) continue;

    const next = joinTags([...tags, "AI"]);
    added += 1;
    console.log(
      `${APPLY ? "ADD" : "WOULD ADD"} ${row.posted} | ${row.label} | ${row.tags ?? "(none)"} -> ${next} | ${row.description}`,
    );
    pending.push({ id: Number(row.id), tags: next });
  }

  if (APPLY && pending.length) {
    const now = Date.now();
    const BATCH = 40;
    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      await Promise.all(
        chunk.map((item) =>
          c.execute({
            sql: `UPDATE transactions SET tags = ?, updated_at = ? WHERE id = ?`,
            args: [item.tags, now, item.id],
          }),
        ),
      );
    }
  }

  console.log(JSON.stringify({ added, already, applied: APPLY }, null, 2));

  if (APPLY) {
    const check = await c.execute(`
      SELECT tags, count(*) AS n
      FROM transactions
      WHERE category = 'Cloud & Hosting'
        AND lower(coalesce(merchant_clean, merchant_name, description)) LIKE '%google%'
      GROUP BY tags
    `);
    console.log("google cloud tags after", check.rows);
  }

  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
