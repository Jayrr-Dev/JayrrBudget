/**
 * MECE category fix on Turso:
 *   Medical Care → Medical
 *   General Shopping → Shopping
 *   Transit & Flights → Flights (Travel); Transit stays under Transport
 *   Rideshare & Transit → Rideshare / Transit by merchant hint
 *
 * Usage: npx tsx scripts/fix-mece-categories.ts [--run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type Client } from "@libsql/client";

const APPLY = process.argv.includes("--run");

function requireTurso(): Client {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing (.env.local)");
  if (!url.startsWith("libsql://")) {
    throw new Error(`Refusing non-Turso URL: ${url}`);
  }
  console.log(`DB: ${url.slice(0, 48)}…`);
  return createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
}

type NodeRow = {
  id: number;
  name: string;
  slug: string;
  facet: string;
  parent_id: number | null;
  path: string;
  depth: number;
};

async function getNodeBySlug(db: Client, slug: string): Promise<NodeRow | null> {
  const res = await db.execute({
    sql: `SELECT id, name, slug, facet, parent_id, path, depth FROM taxonomy_nodes WHERE slug = ? LIMIT 1`,
    args: [slug],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    facet: String(row.facet),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    path: String(row.path),
    depth: Number(row.depth),
  };
}

async function getNodeByNameFacet(
  db: Client,
  name: string,
  facet: string,
): Promise<NodeRow | null> {
  const res = await db.execute({
    sql: `SELECT id, name, slug, facet, parent_id, path, depth FROM taxonomy_nodes WHERE name = ? AND facet = ? LIMIT 1`,
    args: [name, facet],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    facet: String(row.facet),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    path: String(row.path),
    depth: Number(row.depth),
  };
}

async function countRole(db: Client, nodeId: number, role: string) {
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM transaction_labels WHERE node_id = ? AND role = ?`,
    args: [nodeId, role],
  });
  return Number(res.rows[0]?.c ?? 0);
}

async function report(db: Client) {
  const res = await db.execute(`
    SELECT tn.name, COUNT(*) AS c
    FROM transaction_labels tl
    JOIN taxonomy_nodes tn ON tn.id = tl.node_id
    WHERE tl.role = 'category'
      AND (
        tn.name LIKE '%Medical%'
        OR tn.name LIKE '%Shopping%'
        OR tn.name LIKE '%Rideshare%'
        OR tn.name LIKE '%Transit%'
        OR tn.name LIKE '%Flight%'
      )
    GROUP BY tn.name
    ORDER BY c DESC
  `);
  console.log("\nCategory label counts:");
  for (const row of res.rows) {
    console.log(`  ${row.name}: ${row.c}`);
  }
}

async function listRelated(db: Client) {
  const res = await db.execute(`
    SELECT id, facet, slug, name, parent_id, path
    FROM taxonomy_nodes
    WHERE name LIKE '%Medical%'
       OR name LIKE '%Shopping%'
       OR name LIKE '%Rideshare%'
       OR name LIKE '%Transit%'
       OR name LIKE '%Flight%'
       OR slug LIKE '%medical%'
       OR slug LIKE '%shopping%'
       OR slug LIKE '%rideshare%'
       OR slug LIKE '%transit%'
       OR slug LIKE '%flight%'
    ORDER BY facet, path
  `);
  console.log("\nRelated nodes:");
  for (const r of res.rows) {
    console.log(
      `  id=${r.id} [${r.facet}] ${r.name} slug=${r.slug} parent=${r.parent_id} path=${r.path}`,
    );
  }
}

/** Move category labels from → to (set-based). */
async function moveCategoryLabels(db: Client, fromId: number, toId: number, label: string) {
  const n = await countRole(db, fromId, "category");
  console.log(`  ${label}: ${n} labels`);
  if (APPLY && n > 0 && fromId !== toId) {
    await db.execute({
      sql: `UPDATE transaction_labels SET node_id = ? WHERE node_id = ? AND role = 'category'`,
      args: [toId, fromId],
    });
  }
}

/** Reparent children and fix path/depth under new parent. */
async function reparentChildren(db: Client, fromParentId: number, toParent: NodeRow) {
  const kids = await db.execute({
    sql: `SELECT id, name, slug, path FROM taxonomy_nodes WHERE parent_id = ?`,
    args: [fromParentId],
  });
  for (const kid of kids.rows) {
    const newPath = `${toParent.path}/${kid.slug}`;
    const newDepth = toParent.path.split("/").length;
    console.log(`  reparent ${kid.name}: ${kid.path} → ${newPath}`);
    if (APPLY) {
      await db.execute({
        sql: `UPDATE taxonomy_nodes SET parent_id = ?, path = ?, depth = ?, updated_at = ? WHERE id = ?`,
        args: [toParent.id, newPath, newDepth, Date.now(), kid.id],
      });
    }
  }
}

async function ensureCategory(
  db: Client,
  name: string,
  slug: string,
  sectionSlug: string,
): Promise<NodeRow> {
  const existing = await getNodeBySlug(db, slug);
  if (existing) {
    if (existing.name !== name && APPLY) {
      await db.execute({
        sql: `UPDATE taxonomy_nodes SET name = ?, updated_at = ? WHERE id = ?`,
        args: [name, Date.now(), existing.id],
      });
      existing.name = name;
    }
    return existing;
  }

  const section = await getNodeBySlug(db, sectionSlug);
  if (!section) throw new Error(`Missing section slug=${sectionSlug}`);
  const path = `${section.path}/${slug}`;
  const depth = section.path.split("/").length;
  console.log(`  create category ${name} (${slug}) under ${section.name}`);
  if (!APPLY) {
    return {
      id: -1,
      name,
      slug,
      facet: "category",
      parent_id: section.id,
      path,
      depth,
    };
  }
  const ins = await db.execute({
    sql: `INSERT INTO taxonomy_nodes (facet, slug, name, parent_id, path, depth, source, created_at, updated_at)
          VALUES ('category', ?, ?, ?, ?, ?, 'seed', ?, ?)`,
    args: [slug, name, section.id, path, depth, Date.now(), Date.now()],
  });
  const id = Number(ins.lastInsertRowid);
  return {
    id,
    name,
    slug,
    facet: "category",
    parent_id: section.id,
    path,
    depth,
  };
}

async function renameCategoryKeepSlug(db: Client, node: NodeRow, newName: string) {
  console.log(`  rename ${node.name} → ${newName} (slug stays ${node.slug})`);
  if (APPLY) {
    await db.execute({
      sql: `UPDATE taxonomy_nodes SET name = ?, updated_at = ? WHERE id = ?`,
      args: [newName, Date.now(), node.id],
    });
  }
}

async function splitCombinedCategory(
  db: Client,
  combined: NodeRow,
  left: NodeRow,
  right: NodeRow,
  rightHint: RegExp,
  leftLabel: string,
  rightLabel: string,
) {
  const labels = await db.execute({
    sql: `
      SELECT tl.id AS label_id,
             COALESCE(te.merchant_clean, te.merchant_raw, '') AS merchant,
             COALESCE(t.description, '') AS description
      FROM transaction_labels tl
      JOIN transactions t ON t.id = tl.transaction_id
      LEFT JOIN transaction_enrichment te ON te.transaction_id = t.id
      WHERE tl.node_id = ? AND tl.role = 'category'
    `,
    args: [combined.id],
  });
  let toLeft = 0;
  let toRight = 0;
  for (const row of labels.rows) {
    const hay = `${row.merchant} ${row.description}`;
    const target = rightHint.test(hay) ? right.id : left.id;
    if (target === right.id) toRight += 1;
    else toLeft += 1;
    if (APPLY) {
      await db.execute({
        sql: `UPDATE transaction_labels SET node_id = ? WHERE id = ?`,
        args: [target, row.label_id],
      });
    }
  }
  console.log(
    `  split ${combined.name}: ${toLeft} → ${leftLabel}, ${toRight} → ${rightLabel}`,
  );
}

async function main() {
  const db = requireTurso();
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run (pass --run to write)");

  await report(db);
  await listRelated(db);

  console.log("\n--- Medical Care → Medical ---");
  const medical = await ensureCategory(db, "Medical", "medical", "health");
  const medicalCare =
    (await getNodeBySlug(db, "medical-care")) ??
    (await getNodeByNameFacet(db, "Medical Care", "category"));
  if (medicalCare && medicalCare.id !== medical.id && medical.id > 0) {
    await reparentChildren(db, medicalCare.id, medical);
    await moveCategoryLabels(db, medicalCare.id, medical.id, "Medical Care → Medical");
  } else if (medicalCare && medical.id < 0) {
    await renameCategoryKeepSlug(db, medicalCare, "Medical");
  }

  console.log("\n--- General Shopping → Shopping ---");
  const shopping = await ensureCategory(db, "Shopping", "shopping", "lifestyle");
  const generalShopping =
    (await getNodeBySlug(db, "general-shopping")) ??
    (await getNodeByNameFacet(db, "General Shopping", "category"));
  if (generalShopping && generalShopping.id !== shopping.id && shopping.id > 0) {
    await reparentChildren(db, generalShopping.id, shopping);
    await moveCategoryLabels(
      db,
      generalShopping.id,
      shopping.id,
      "General Shopping → Shopping",
    );
  } else if (generalShopping && shopping.id < 0) {
    await renameCategoryKeepSlug(db, generalShopping, "Shopping");
  }

  console.log("\n--- Transit & Flights → Flights; Transit stays ---");
  const transit = await ensureCategory(db, "Transit", "transit", "transport");
  const rideshare = await ensureCategory(db, "Rideshare", "rideshare", "transport");
  const transitFlights =
    (await getNodeBySlug(db, "transit-and-flights")) ??
    (await getNodeByNameFacet(db, "Transit & Flights", "category"));

  // Prefer renaming Transit & Flights category → Flights.
  // Free slug `flights` first (subcategory → Airline Tickets), then claim it.
  let flights: NodeRow | null = await getNodeByNameFacet(db, "Flights", "category");
  if (transitFlights) {
    const flightSub = await getNodeBySlug(db, "flights");
    if (flightSub && flightSub.facet === "subcategory") {
      console.log(`  rename subcategory Flights → Airline Tickets (slug airline-tickets)`);
      if (APPLY) {
        await db.execute({
          sql: `UPDATE taxonomy_nodes SET name = ?, slug = ?, path = ?, updated_at = ? WHERE id = ?`,
          args: [
            "Airline Tickets",
            "airline-tickets",
            String(flightSub.path).replace(/\/flights$/, "/airline-tickets"),
            Date.now(),
            flightSub.id,
          ],
        });
      }
    }

    const travelSection = await db.execute({
      sql: `SELECT id, name, slug, facet, parent_id, path, depth FROM taxonomy_nodes WHERE facet = 'section' AND (slug = 'travel' OR name = 'Travel') LIMIT 1`,
      args: [],
    });
    const travelSec = travelSection.rows[0]
      ? {
          id: Number(travelSection.rows[0].id),
          name: String(travelSection.rows[0].name),
          slug: String(travelSection.rows[0].slug),
          facet: String(travelSection.rows[0].facet),
          parent_id:
            travelSection.rows[0].parent_id == null
              ? null
              : Number(travelSection.rows[0].parent_id),
          path: String(travelSection.rows[0].path),
          depth: Number(travelSection.rows[0].depth),
        }
      : null;
    let parentId = transitFlights.parent_id;
    let parentPath = transitFlights.path.includes("/")
      ? transitFlights.path.slice(0, transitFlights.path.lastIndexOf("/"))
      : "";
    if (travelSec) {
      parentId = travelSec.id;
      parentPath = travelSec.path;
    }
    const newPath = parentPath ? `${parentPath}/flights` : "flights";
    const newDepth = parentPath ? parentPath.split("/").length : 0;
    console.log(
      `  rename ${transitFlights.name} → Flights slug=flights path=${newPath}`,
    );
    if (APPLY) {
      await db.execute({
        sql: `UPDATE taxonomy_nodes SET name = ?, slug = ?, parent_id = ?, path = ?, depth = ?, updated_at = ? WHERE id = ?`,
        args: [
          "Flights",
          "flights",
          parentId,
          newPath,
          newDepth,
          Date.now(),
          transitFlights.id,
        ],
      });
    }
    flights = {
      ...transitFlights,
      name: "Flights",
      slug: "flights",
      parent_id: parentId,
      path: newPath,
      depth: newDepth,
    };

    // Fix child paths under renamed Flights category
    const kids = await db.execute({
      sql: `SELECT id, name, slug, path FROM taxonomy_nodes WHERE parent_id = ?`,
      args: [transitFlights.id],
    });
    for (const kid of kids.rows) {
      const name = String(kid.name);
      const isPublicTransit =
        /transit|bus|metro|public/i.test(name) &&
        !/flight|airline|rental|in-?flight/i.test(name);
      if (isPublicTransit && transit.id > 0) {
        const movedPath = `${transit.path}/${kid.slug}`;
        const movedDepth = transit.path.split("/").length;
        console.log(`  move subcategory ${name} under Transit`);
        if (APPLY) {
          await db.execute({
            sql: `UPDATE taxonomy_nodes SET parent_id = ?, path = ?, depth = ?, updated_at = ? WHERE id = ?`,
            args: [transit.id, movedPath, movedDepth, Date.now(), kid.id],
          });
        }
        continue;
      }
      const childPath = `${newPath}/${kid.slug === "flights" ? "airline-tickets" : kid.slug}`;
      console.log(`  fix child path ${kid.name} → ${childPath}`);
      if (APPLY) {
        await db.execute({
          sql: `UPDATE taxonomy_nodes SET path = ?, depth = ?, updated_at = ? WHERE id = ?`,
          args: [childPath, newDepth + 1, Date.now(), kid.id],
        });
      }
    }

    if (transit.id > 0) {
      await splitCombinedCategory(
        db,
        transitFlights,
        flights,
        transit,
        /transit|bus|metro|subway|ttc|go\s*train|via\s*rail|presto|parking|fare|pass/i,
        "Flights",
        "Transit",
      );
    }
  } else if (!flights) {
    flights = await ensureCategory(db, "Flights", "flights", "travel");
  }

  console.log("\n--- Rideshare & Transit → Rideshare / Transit ---");
  for (const slug of ["rideshare-and-transit", "rideshare-transit"]) {
    const combined = await getNodeBySlug(db, slug);
    if (combined && rideshare.id > 0 && transit.id > 0) {
      await splitCombinedCategory(
        db,
        combined,
        rideshare,
        transit,
        /transit|bus|metro|subway|ttc|go\s*train|via\s*rail|presto|parking|fare|pass/i,
        "Rideshare",
        "Transit",
      );
      // Keep ghost node from polluting category pickers.
      const left = await countRole(db, combined.id, "category");
      if (left === 0 || !APPLY) {
        console.log(`  retire node ${combined.name} (hide from picker)`);
        if (APPLY) {
          await db.execute({
            sql: `UPDATE taxonomy_nodes SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
            args: [
              "_Retired Rideshare Transit",
              `retired-${combined.slug}`,
              Date.now(),
              combined.id,
            ],
          });
        }
      }
    }
  }
  const combinedByName =
    (await getNodeByNameFacet(db, "Rideshare & Transit", "category")) ??
    (await getNodeByNameFacet(db, "Rideshare and Transit", "category"));
  if (
    combinedByName &&
    rideshare.id > 0 &&
    transit.id > 0 &&
    !["rideshare-and-transit", "rideshare-transit"].includes(combinedByName.slug) &&
    !combinedByName.slug.startsWith("retired-")
  ) {
    await splitCombinedCategory(
      db,
      combinedByName,
      rideshare,
      transit,
      /transit|bus|metro|subway|ttc|go\s*train|via\s*rail|presto|parking|fare|pass/i,
      "Rideshare",
      "Transit",
    );
  }

  // Retire empty duplicate category shells so pickers stay MECE.
  for (const name of ["Medical Care", "General Shopping", "Transit & Flights"]) {
    const node = await getNodeByNameFacet(db, name, "category");
    if (!node) continue;
    const left = await countRole(db, node.id, "category");
    console.log(`\n--- retire empty ${name} (labels left=${left}) ---`);
    if (APPLY && left === 0) {
      await db.execute({
        sql: `UPDATE taxonomy_nodes SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
        args: [`_Retired ${name}`, `retired-${node.slug}`, Date.now(), node.id],
      });
    }
  }

  await report(db);
  console.log(APPLY ? "\nDone." : "\nDry-run only. Re-run with --run to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
