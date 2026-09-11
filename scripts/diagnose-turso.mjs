import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
  timeout: 60_000,
});

for (const t of [
  "entities",
  "bank_history_rows",
  "transactions",
  "transaction_amounts",
]) {
  const info = await c.execute(`pragma table_info(${t})`);
  console.log(t, info.rows.map((r) => r.name).join(","));
}

try {
  const r = await c.execute(`
    select t.id, a.amount_minor, d.posted_date, e.website
    from transactions t
    inner join transaction_amounts a on a.transaction_id = t.id
    inner join transaction_dates d on d.transaction_id = t.id
    left join entities e on e.id = 1
    limit 1
  `);
  console.log("simple ok", r.rows[0]);
} catch (e) {
  console.error("simple fail", e.message);
}

try {
  const r = await c.execute({
    sql: `select t.id from transactions t
      left join bank_history_rows b on b.matched_transaction_id = t.id and b.match_status = ?
      limit 1`,
    args: ["matched"],
  });
  console.log("bank join ok", r.rows[0]);
} catch (e) {
  console.error("bank join fail", e.message);
}

try {
  const r = await c.execute({
    sql: `select "company_entity"."website", "company_entity"."logo_url"
      from transactions
      left join transaction_entities "company_link"
        on ("company_link"."transaction_id" = "transactions"."id" and "company_link"."role" = ?)
      left join entities "company_entity"
        on "company_entity"."id" = "company_link"."entity_id"
      limit 1`,
    args: ["company"],
  });
  console.log("entity website ok", r.rows[0]);
} catch (e) {
  console.error("entity website fail", e.message);
}
