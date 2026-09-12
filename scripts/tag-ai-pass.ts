/**
 * AI tag pass:
 * - Add AI to CapCut + Canva (AI-forward creative tools)
 * - Remove mistaken AI from Wealthsimple Tax
 * - Ensure SparkReceipt keeps AI (already tagged)
 *
 *   npx tsx scripts/tag-ai-pass.ts          # dry-run
 *   npx tsx scripts/tag-ai-pass.ts --run    # apply
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

type Action = "add" | "remove";

function blob(row: Record<string, unknown>): string {
  return [
    row.merchant_clean,
    row.merchant_name,
    row.description,
    row.original_description,
    row.company,
    row.brand,
  ]
    .map((x) => String(x ?? ""))
    .join(" ");
}

function classify(row: Record<string, unknown>): Action | null {
  const text = blob(row);
  const tags = splitTags(row.tags == null ? null : String(row.tags));
  const hasAi = hasTag(tags, "AI");

  // False positive: Wealthsimple Tax is not an AI product
  if (
    /wealthsimple\s*tax/i.test(text) ||
    (/wealthsimple/i.test(text) && /tax/i.test(text))
  ) {
    return hasAi ? "remove" : null;
  }

  // Creative AI tools
  if (/\bcapcut\b/i.test(text) || /\bcanva\b/i.test(text)) {
    return hasAi ? null : "add";
  }

  // SparkReceipt (AI receipt scanner via Paddle)
  if (
    /sparkrec(?:ei)?pt|sparkreceipt/i.test(text) ||
    /paddle\.net\*\s*spark/i.test(text)
  ) {
    return hasAi ? null : "add";
  }

  return null;
}

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
      merchant_clean, merchant_name, description, original_description,
      company, brand, category, subcategory, tags, amount
    FROM transactions
    WHERE lower(coalesce(merchant_clean,'')) LIKE '%capcut%'
       OR lower(coalesce(merchant_clean,'')) LIKE '%canva%'
       OR lower(coalesce(merchant_clean,'')) LIKE '%wealthsimple%'
       OR lower(coalesce(merchant_clean,'')) LIKE '%spark%'
       OR lower(coalesce(merchant_clean,'')) LIKE '%paddle%'
       OR lower(coalesce(description,'')) LIKE '%capcut%'
       OR lower(coalesce(description,'')) LIKE '%canva%'
       OR lower(coalesce(description,'')) LIKE '%wealthsimple%tax%'
       OR lower(coalesce(description,'')) LIKE '%sparkrec%'
       OR lower(coalesce(description,'')) LIKE '%paddle.net%spark%'
       OR lower(coalesce(tags,'')) = 'ai'
       OR lower(coalesce(tags,'')) LIKE 'ai,%'
       OR lower(coalesce(tags,'')) LIKE '%, ai'
       OR lower(coalesce(tags,'')) LIKE '%, ai,%'
  `);

  let added = 0;
  let removed = 0;
  const pending: Array<{
    id: number;
    tags: string | null;
    action: Action;
    label: string;
  }> = [];

  for (const row of rows.rows) {
    const action = classify(row as Record<string, unknown>);
    if (!action) continue;
    const tags = splitTags(row.tags == null ? null : String(row.tags));
    let next: string | null;
    if (action === "add") {
      next = joinTags([...tags, "AI"]);
      added += 1;
    } else {
      next = joinTags(tags.filter((t) => t.toLowerCase() !== "ai"));
      removed += 1;
    }
    const label = String(row.label ?? "");
    console.log(
      `${APPLY ? action.toUpperCase() : `WOULD ${action.toUpperCase()}`} ${row.posted} | ${label} | ${row.tags ?? "(none)"} -> ${next ?? "(none)"}`,
    );
    pending.push({ id: Number(row.id), tags: next, action, label });
  }

  if (APPLY && pending.length) {
    const BATCH = 40;
    const now = Date.now();
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

  console.log(JSON.stringify({ added, removed, applied: APPLY }, null, 2));

  if (APPLY) {
    const check = await c.execute(`
      SELECT coalesce(merchant_clean, merchant_name, description) AS label,
        tags, count(*) AS n
      FROM transactions
      WHERE lower(coalesce(merchant_clean,'')) LIKE '%capcut%'
         OR lower(coalesce(merchant_clean,'')) LIKE '%canva%'
         OR lower(coalesce(description,'')) LIKE '%wealthsimple%tax%'
         OR lower(coalesce(description,'')) LIKE '%sparkrec%'
      GROUP BY 1, 2
      ORDER BY label
    `);
    console.log("after", check.rows);
  }

  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
