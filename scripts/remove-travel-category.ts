/**
 * Remove Travel category (tag covers it). Remap:
 * Transport/Travel/Airline Tickets|In-Flight → Transport/Flights/...
 * Transport/Travel/Car Rental → Transport/Vehicle/Car Rental
 * Transport/Travel/Rideshare → Transport/Rideshare/Rideshare
 * Entertainment/Travel/Attractions → Entertainment/Attractions & Tours/Theme Parks|Tours|Recreation
 * Entertainment/Travel/Hotels → Entertainment/Lodging/Hotels & Vacation Rentals
 *
 * Usage: npx tsx scripts/remove-travel-category.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type Client } from "@libsql/client";

const APPLY = process.argv.includes("--run");

async function ensure(
  db: Client,
  table: string,
  name: string,
): Promise<number> {
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

async function setTree(
  db: Client,
  id: number,
  section: string,
  sectionId: number,
  category: string,
  categoryId: number,
  subcategory: string,
  subcategoryId: number,
) {
  if (!APPLY) return;
  await db.execute({
    sql: `
      UPDATE transactions
      SET section = ?, section_id = ?,
          category = ?, category_id = ?,
          subcategory = ?, subcategory_id = ?,
          updated_at = ?
      WHERE id = ?
    `,
    args: [
      section,
      sectionId,
      category,
      categoryId,
      subcategory,
      subcategoryId,
      Date.now(),
      id,
    ],
  });
}

function attractionBucket(merchant: string, description: string): string {
  const hay = `${merchant} ${description}`.toLowerCase();
  if (/ocean\s*park|theme\s*park|disney|universal|six\s*flags/.test(hay)) {
    return "Theme Parks";
  }
  if (/circle\s*line|tour|sightseeing|cruise|hop.?on/.test(hay)) {
    return "Tours";
  }
  // pickleball, driving range, etc.
  return "Recreation";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("libsql://")) throw new Error(`Need Turso, got ${url}`);
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");

  const before = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions WHERE category = 'Travel'
    GROUP BY section, category, subcategory ORDER BY c DESC
  `);
  console.log("before:");
  for (const r of before.rows) console.log(r);

  const transportId = await ensure(db, "transaction_sections", "Transport");
  const entertainmentId = await ensure(
    db,
    "transaction_sections",
    "Entertainment",
  );

  const flightsId = await ensure(db, "transaction_categories", "Flights");
  const vehicleId = await ensure(db, "transaction_categories", "Vehicle");
  const rideshareCatId = await ensure(db, "transaction_categories", "Rideshare");
  const attractionsCatId = await ensure(
    db,
    "transaction_categories",
    "Attractions & Tours",
  );
  const lodgingId = await ensure(db, "transaction_categories", "Lodging");

  const airlineSub = await ensure(db, "transaction_subcategories", "Airline Tickets");
  const inflightSub = await ensure(db, "transaction_subcategories", "In-Flight");
  const carSub = await ensure(db, "transaction_subcategories", "Car Rental");
  const rideshareSub = await ensure(db, "transaction_subcategories", "Rideshare");
  const themeSub = await ensure(db, "transaction_subcategories", "Theme Parks");
  const toursSub = await ensure(db, "transaction_subcategories", "Tours");
  const recreationSub = await ensure(db, "transaction_subcategories", "Recreation");
  const hotelsSub = await ensure(
    db,
    "transaction_subcategories",
    "Hotels & Vacation Rentals",
  );

  const rows = await db.execute(`
    SELECT id, section, category, subcategory, merchant_clean, description
    FROM transactions WHERE category = 'Travel'
  `);

  const counts: Record<string, number> = {};
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };

  for (const row of rows.rows) {
    const id = Number(row.id);
    const sub = String(row.subcategory ?? "");
    const merchant = String(row.merchant_clean ?? "");
    const desc = String(row.description ?? "");

    if (sub === "Airline Tickets") {
      bump("Transport/Flights/Airline Tickets");
      await setTree(
        db,
        id,
        "Transport",
        transportId,
        "Flights",
        flightsId,
        "Airline Tickets",
        airlineSub,
      );
      continue;
    }
    if (sub === "In-Flight") {
      bump("Transport/Flights/In-Flight");
      await setTree(
        db,
        id,
        "Transport",
        transportId,
        "Flights",
        flightsId,
        "In-Flight",
        inflightSub,
      );
      continue;
    }
    if (sub === "Car Rental") {
      bump("Transport/Vehicle/Car Rental");
      await setTree(
        db,
        id,
        "Transport",
        transportId,
        "Vehicle",
        vehicleId,
        "Car Rental",
        carSub,
      );
      continue;
    }
    if (sub === "Rideshare") {
      bump("Transport/Rideshare/Rideshare");
      await setTree(
        db,
        id,
        "Transport",
        transportId,
        "Rideshare",
        rideshareCatId,
        "Rideshare",
        rideshareSub,
      );
      continue;
    }
    if (sub === "Hotels & Vacation Rentals") {
      bump("Entertainment/Lodging/Hotels & Vacation Rentals");
      await setTree(
        db,
        id,
        "Entertainment",
        entertainmentId,
        "Lodging",
        lodgingId,
        "Hotels & Vacation Rentals",
        hotelsSub,
      );
      continue;
    }
    if (sub === "Attractions & Tours") {
      const bucket = attractionBucket(merchant, desc);
      const subId =
        bucket === "Theme Parks"
          ? themeSub
          : bucket === "Tours"
            ? toursSub
            : recreationSub;
      bump(`Entertainment/Attractions & Tours/${bucket}`);
      console.log(
        `  attraction → ${bucket}: ${merchant} | ${desc.slice(0, 60)}`,
      );
      await setTree(
        db,
        id,
        "Entertainment",
        entertainmentId,
        "Attractions & Tours",
        attractionsCatId,
        bucket,
        subId,
      );
      continue;
    }

    bump(`UNMAPPED/${sub}`);
    console.log(`UNMAPPED id=${id} sub=${sub} ${desc}`);
  }

  console.log("\nremap counts:");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);

  if (APPLY) {
    const left = await db.execute(
      `SELECT COUNT(*) AS c FROM transactions WHERE category = 'Travel'`,
    );
    console.log(`Travel category left: ${left.rows[0]?.c}`);
    if (Number(left.rows[0]?.c ?? 0) === 0) {
      await db.execute({
        sql: `UPDATE transaction_categories SET name = ? WHERE name = 'Travel'`,
        args: ["_Retired Travel Category"],
      });
    }
  }

  const after = await db.execute(`
    SELECT section, category, subcategory, COUNT(*) AS c
    FROM transactions
    WHERE category IN (
      'Flights','Vehicle','Rideshare','Attractions & Tours','Lodging','Travel'
    )
    GROUP BY section, category, subcategory
    ORDER BY section, category, c DESC
  `);
  console.log("\nafter:");
  for (const r of after.rows) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
