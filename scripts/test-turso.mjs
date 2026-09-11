import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
const token = process.env.DATABASE_AUTH_TOKEN;

if (!url || !token) {
  console.error("missing DATABASE_URL or DATABASE_AUTH_TOKEN");
  process.exit(1);
}

console.log("host", url.replace(/^libsql:\/\//, "").split("/")[0]);
console.log("hasToken", true);

const client = createClient({ url, authToken: token, timeout: 60_000 });

const [txns, accounts, tables] = await Promise.all([
  client.execute("select count(*) as n from transactions"),
  client.execute("select count(*) as n from accounts"),
  client.execute(
    "select name from sqlite_master where type='table' order by name",
  ),
]);

console.log({
  txns: txns.rows[0].n,
  accounts: accounts.rows[0].n,
  tables: tables.rows.map((row) => row.name),
});
