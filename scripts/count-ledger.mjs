import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
});
const u = await c.execute(
  "select status, count(*) as n from statement_uploads group by status",
);
const t = await c.execute("select count(*) as n from transactions");
const a = await c.execute("select count(*) as n from accounts");
console.log({ uploads: u.rows, txns: t.rows[0], accounts: a.rows[0] });
