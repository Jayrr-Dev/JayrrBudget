import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
});

async function q(sql, args = []) {
  const res = await c.execute({ sql, args });
  return res.rows;
}

function pct(part, whole) {
  if (!whole) return "n/a";
  return `${Math.round((1000 * part) / whole) / 10}%`;
}

const totals = (await q("select count(*) as n from transactions"))[0];
const n = Number(totals.n);

const accounts = await q(`
  select a.name, a.mask, a.type, a.subtype, count(t.id) as txns,
    min(t.date) as first_date, max(t.date) as last_date,
    round(sum(t.amount), 2) as amount_sum
  from accounts a
  left join transactions t on t.account_id = a.plaid_account_id
  group by a.id
  order by txns desc
`);

const uploads = await q(`
  select
    count(*) as n,
    sum(case when status='completed' then 1 else 0 end) as completed,
    sum(case when status='processing' then 1 else 0 end) as processing,
    sum(case when status='failed' then 1 else 0 end) as failed,
    sum(case when balance_ok=1 then 1 else 0 end) as balanced,
    sum(case when balance_ok=0 then 1 else 0 end) as mismatch,
    sum(case when balance_ok is null then 1 else 0 end) as unknown_bal
  from statement_uploads
`);

const fill = (
  await q(`
  select
    sum(case when merchant_name is not null and trim(merchant_name) != '' then 1 else 0 end) as merchant,
    sum(case when category_detailed is not null and trim(category_detailed) != '' then 1 else 0 end) as cat_detailed,
    sum(case when category_primary is not null and trim(category_primary) != '' then 1 else 0 end) as cat_primary,
    sum(case when payment_channel is not null and trim(payment_channel) != '' then 1 else 0 end) as channel,
    sum(case when transaction_code is not null and trim(transaction_code) != '' then 1 else 0 end) as txn_code,
    sum(case when location_city is not null and trim(location_city) != '' then 1 else 0 end) as city,
    sum(case when location_region is not null and trim(location_region) != '' then 1 else 0 end) as region,
    sum(case when authorized_date is not null and trim(authorized_date) != '' then 1 else 0 end) as auth_date,
    sum(case when date glob '____-__-__' then 1 else 0 end) as iso_date,
    sum(case when date not glob '____-__-__' then 1 else 0 end) as bad_date
  from transactions
`)
)[0];

const topCats = await q(`
  select coalesce(category_detailed, '(none)') as label, count(*) as n
  from transactions
  group by 1
  order by n desc
  limit 20
`);

const junkCats = await q(`
  select category_detailed as label, count(*) as n
  from transactions
  where category_detailed in (
    'Transportation','Retail and Grocery','Foreign Currency Transactions',
    'Personal and Household Expenses','Professional and Financial Services',
    'Digital Content','Software and Subscriptions','Health and Education'
  )
  group by 1
`);

const dupes = await q(`
  select date, amount, lower(trim(name)) as name, count(*) as n
  from transactions
  group by 1,2,3
  having n > 1
  order by n desc
  limit 12
`);

const enrich = (
  await q(`
  select
    (select count(*) from transaction_enrichment) as rows,
    (select count(*) from entities) as entities,
    (select count(*) from taxonomy_nodes) as nodes,
    (select count(*) from transaction_labels) as labels
`)
)[0];

const mismatches = await q(`
  select filename, institution_name, account_mask, transaction_count,
    opening_balance, closing_balance, transaction_sum, balance_delta, balance_ok
  from statement_uploads
  where status='completed' and (balance_ok = 0 or balance_ok is null)
  order by abs(coalesce(balance_delta,0)) desc
  limit 10
`);

const samples = await q(`
  select t.date, t.authorized_date, a.mask, t.merchant_name, t.name,
    t.amount, t.category_detailed, t.category_primary, t.payment_channel,
    t.transaction_code, t.location_city, t.location_region
  from transactions t
  join accounts a on a.plaid_account_id = t.account_id
  order by random()
  limit 16
`);

const weirdAmounts = await q(`
  select count(*) as n from transactions where amount = 0
`);

const signSplit = await q(`
  select
    sum(case when amount > 0 then 1 else 0 end) as spend_rows,
    sum(case when amount < 0 then 1 else 0 end) as credit_rows,
    round(sum(case when amount > 0 then amount else 0 end), 2) as spend_sum,
    round(sum(case when amount < 0 then amount else 0 end), 2) as credit_sum
  from transactions
`);

console.log(JSON.stringify({
  n,
  accounts,
  uploads: uploads[0],
  fill: {
    merchant: pct(Number(fill.merchant), n),
    cat_detailed: pct(Number(fill.cat_detailed), n),
    cat_primary: pct(Number(fill.cat_primary), n),
    channel: pct(Number(fill.channel), n),
    txn_code: pct(Number(fill.txn_code), n),
    city: pct(Number(fill.city), n),
    region: pct(Number(fill.region), n),
    auth_date: pct(Number(fill.auth_date), n),
    iso_date: pct(Number(fill.iso_date), n),
    bad_date: Number(fill.bad_date),
  },
  topCats,
  junkCats,
  dupeGroups: dupes,
  enrich,
  mismatches,
  signSplit: signSplit[0],
  zeroAmounts: weirdAmounts[0],
  samples,
}, null, 2));
