import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb } from "../src/shared/db";
import { transactionLocations } from "../src/shared/db/schema";
import { normalizePlaceName } from "../src/shared/lib/place-name";

async function main() {
  const db = getDb();
  const rows = await db
    .select({
      transactionId: transactionLocations.transactionId,
      city: transactionLocations.city,
    })
    .from(transactionLocations);

  let updated = 0;
  const samples: Array<{ from: string; to: string }> = [];

  for (const row of rows) {
    const nextCity = normalizePlaceName(row.city);
    const prev = row.city?.trim() || null;
    if (nextCity === prev) continue;

    await db
      .update(transactionLocations)
      .set({ city: nextCity })
      .where(eq(transactionLocations.transactionId, row.transactionId));

    updated += 1;
    if (samples.length < 40 && prev) {
      samples.push({ from: prev, to: nextCity ?? "" });
    }
  }

  console.log(JSON.stringify({ scanned: rows.length, updated, samples }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
