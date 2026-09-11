/**
 * Kill Travel section. Fold into category "Travel" under Transport / Entertainment.
 *
 * Transport / Travel / Airline Tickets | In-Flight | Car Rental
 * Entertainment / Travel / Attractions & Tours | Hotels & Vacation Rentals
 *
 * Usage: npx tsx scripts/fold-travel-into-categories.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type Client } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function ensureSection(db: Client, name: string): Promise<number> {
  const hit = await db.execute({
    sql: `SELECT id FROM transaction_sections WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (hit.rows[0]?.id != null) return Number(hit.rows[0].id);
  if (!APPLY) return -1;
  const ins = await db.execute({
    sql: `INSERT INTO transaction_sections (name) VALUES (?)`,
    args: [name],
  });
  return Number(ins.lastInsertRowid);
}

async function ensureCategory(
  db: Client,
  name: string,
  sectionId: number | null,
): Promise<number> {
  const hit = await db.execute({
    sql: `SELECT id FROM transaction_categories WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (hit.rows[0]?.id != null) {
    const id = Number(hit.rows[0].id);
    if (APPLY && sectionId != null) {
      await db.execute({
        sql: `UPDATE transaction_categories SET section_id = COALESCE(section_id, ?) WHERE id = ?`,
        args: [sectionId, id],
      });
    }
    return id;
  }
  if (!APPLY) return -1;
  const ins = await db.execute({
    sql: `INSERT INTO transaction_categories (name, section_id) VALUES (?, ?)`,
    args: [name, sectionId],
  });
  return Number(ins.lastInsertRowid);
}

async function ensureSubcategory(db: Client, name: string): Promise<number | null> {
  const hit = await db.execute({
    sql: `SELECT id FROM transaction_subcategories WHERE name = ? LIMIT 1`,
    args: [name],
  });
  if (hit.rows[0]?.id != null) return Number(hit.rows[0].id);
  if (!APPLY) return null;
  const ins = await db.execute({
    sql: `INSERT INTO transaction_subcategories (name) VALUES (?)`,
    args: [name],
  });
  return Number(ins.lastInsertRowid);
}

async function report(db: Client, label: string) {
  const q = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE section IN ('Travel','Transport','Entertainment')
      AND (
        category IN ('Travel','Flights','Rentals','Sightseeing')
        OR subcategory IN (
          'Airline Tickets','In-Flight','Car Rental',
          'Hotels & Vacation Rentals','Attractions & Tours'
        )
      )
    GROUP BY section, category, subcategory
    ORDER BY section, category, c DESC
  `);
  console.log(`\n${label}:`);
  for (const r of q.rows) console.log(r);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  await report(db, "before");

  const transportId = await ensureSection(db, "Transport");
  const entertainmentId = await ensureSection(db, "Entertainment");
  // Category name "Travel" under both sections — one lookup row named Travel.
  // Flat model has unique category names, so both sections share category "Travel".
  const travelCatId = await ensureCategory(db, "Travel", transportId);

  const airlineId = await ensureSubcategory(db, "Airline Tickets");
  const inflightId = await ensureSubcategory(db, "In-Flight");
  const carId = await ensureSubcategory(db, "Car Rental");
  const hotelsId = await ensureSubcategory(db, "Hotels & Vacation Rentals");
  const attractionsId = await ensureSubcategory(db, "Attractions & Tours");

  type Rule = {
    section: string;
    sectionId: number;
    subcategory: string;
    subcategoryId: number | null;
    match: string;
  };

  const rules: Rule[] = [
    {
      section: "Transport",
      sectionId: transportId,
      subcategory: "Airline Tickets",
      subcategoryId: airlineId,
      match: `category = 'Flights' AND subcategory = 'Airline Tickets'`,
    },
    {
      section: "Transport",
      sectionId: transportId,
      subcategory: "In-Flight",
      subcategoryId: inflightId,
      match: `category = 'Flights' AND subcategory = 'In-Flight'`,
    },
    {
      section: "Transport",
      sectionId: transportId,
      subcategory: "Car Rental",
      subcategoryId: carId,
      match: `subcategory = 'Car Rental'`,
    },
    {
      section: "Entertainment",
      sectionId: entertainmentId,
      subcategory: "Hotels & Vacation Rentals",
      subcategoryId: hotelsId,
      match: `subcategory = 'Hotels & Vacation Rentals' OR (category = 'Rentals' AND subcategory = 'Hotels & Vacation Rentals') OR category = 'Lodging'`,
    },
    {
      section: "Entertainment",
      sectionId: entertainmentId,
      subcategory: "Attractions & Tours",
      subcategoryId: attractionsId,
      match: `category = 'Sightseeing' OR subcategory = 'Attractions & Tours'`,
    },
  ];

  for (const rule of rules) {
    const count = await db.execute(
      `SELECT COUNT(*) AS c FROM transactions WHERE section = 'Travel' AND (${rule.match})`,
    );
    console.log(
      `  ${rule.section} / Travel / ${rule.subcategory}: ${count.rows[0]?.c}`,
    );
    if (!APPLY) continue;
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = ?,
            section_id = ?,
            category = 'Travel',
            category_id = ?,
            subcategory = ?,
            subcategory_id = ?,
            updated_at = ?
        WHERE section = 'Travel' AND (${rule.match})
      `,
      args: [
        rule.section,
        rule.sectionId > 0 ? rule.sectionId : null,
        travelCatId > 0 ? travelCatId : null,
        rule.subcategory,
        rule.subcategoryId,
        Date.now(),
      ],
    });
  }

  // Any leftover Travel section rows → Transport / Travel / old category as subcategory
  const leftover = await db.execute(
    `SELECT COUNT(*) AS c FROM transactions WHERE section = 'Travel'`,
  );
  console.log(`leftover Travel section rows: ${leftover.rows[0]?.c}`);
  if (APPLY && Number(leftover.rows[0]?.c ?? 0) > 0) {
    await db.execute({
      sql: `
        UPDATE transactions
        SET section = 'Transport',
            section_id = ?,
            subcategory = COALESCE(NULLIF(subcategory, ''), category, 'Travel'),
            category = 'Travel',
            category_id = ?,
            updated_at = ?
        WHERE section = 'Travel'
      `,
      args: [
        transportId > 0 ? transportId : null,
        travelCatId > 0 ? travelCatId : null,
        Date.now(),
      ],
    });
  }

  if (APPLY) {
    // Retire empty Travel section name in lookup (keep id if FKs)
    const still = await db.execute(
      `SELECT COUNT(*) AS c FROM transactions WHERE section = 'Travel'`,
    );
    if (Number(still.rows[0]?.c ?? 0) === 0) {
      await db.execute({
        sql: `UPDATE transaction_sections SET name = ? WHERE name = 'Travel'`,
        args: ["_Retired Travel"],
      });
    }
  }

  await report(db, "after");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
