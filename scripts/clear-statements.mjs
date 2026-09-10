import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL || "file:./data/jayrr-budget.db",
});

await client.execute(
  "DELETE FROM transactions WHERE source = 'statement' OR institution_id = 'manual-statements'",
);
await client.execute(
  "DELETE FROM accounts WHERE institution_id = 'manual-statements' OR account_id LIKE 'manual-stmt-%'",
);
await client.execute("DELETE FROM statement_uploads");
await client.execute(
  "DELETE FROM institutions WHERE institution_id = 'manual-statements'",
);

const after = await client.execute(
  "select (select count(*) from transactions) as txns, (select count(*) from statement_uploads) as uploads",
);
console.log("cleared", after.rows[0]);
