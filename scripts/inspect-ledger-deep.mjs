import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const c = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
});

async function q(sql, args = []) {
  return (await c.execute({ sql, args })).rows;
}

function parseCsv(path) {
  const text = readFileSync(path, "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(
      /^(\d{4}-\d{2}-\d{2}),(?:"([^"]*)"|([^,]*))(?:,(.*))?$/,
    );
    if (!match) continue;
    const date = match[1];
    const desc = (match[2] ?? match[3] ?? "").trim();
    const rest = match[4] ?? "";
    const parts = rest.split(",").map((p) => p.trim());
    const nums = parts
      .map((p) => p.replace(/[^0-9.-]/g, ""))
      .filter((p) => p !== "" && !p.startsWith("450") && !p.startsWith("526"));
    const debit = nums[0] ? Number(nums[0]) : 0;
    const credit = nums[1] ? Number(nums[1]) : 0;
    const amount = debit ? debit : credit ? -credit : 0;
    rows.push({ date, desc, amount });
  }
  return rows;
}

const uploads = await q(`
  select filename, account_mask, institution_name, account_name,
    status, transaction_count, balance_ok, balance_delta,
    statement_period_start, statement_period_end
  from statement_uploads
  where status='completed'
  order by account_mask, statement_period_start
`);

const masks = await q(`
  select a.mask, a.name, a.type,
    count(t.id) as txns,
    sum(case when t.amount > 0 then 1 else 0 end) as pos,
    sum(case when t.amount < 0 then 1 else 0 end) as neg,
    round(avg(t.amount), 2) as avg_amt
  from accounts a
  left join transactions t on t.account_id = a.account_id
  group by a.id
`);

const ocrJunk = await q(`
  select count(*) as n from transactions
  where name glob '*[↑❗*#@]*' or name like '%**%'
`);

const merchantDrift = await q(`
  select merchant_name, group_concat(distinct category_detailed) as cats,
    count(*) as n, count(distinct category_detailed) as cat_n
  from transactions
  where merchant_name is not null
  group by merchant_name
  having cat_n > 1
  order by n desc
  limit 15
`);

const missingMerchant = await q(`
  select substr(name,1,80) as name, count(*) as n
  from transactions
  where merchant_name is null or trim(merchant_name)=''
  group by 1
  order by n desc
  limit 10
`);

const twins = await q(`
  select t.date, t.amount, t.name, group_concat(distinct a.mask) as masks, count(*) as n
  from transactions t
  join accounts a on a.account_id = t.account_id
  group by t.date, t.amount, lower(trim(t.name))
  having n > 1
`);

const monthCov = await q(`
  select a.mask, substr(t.date,1,7) as ym, count(*) as n
  from transactions t
  join accounts a on a.account_id = t.account_id
  group by a.mask, ym
  order by a.mask, ym
`);

const visaSample = await q(`
  select t.date, t.merchant_name, t.name, t.amount, t.category_detailed, t.payment_channel
  from transactions t
  join accounts a on a.account_id = t.account_id
  where a.mask in ('3945','1654')
  order by random() limit 8
`);

const cheqSample = await q(`
  select t.date, t.merchant_name, t.name, t.amount, t.category_detailed, t.transaction_code
  from transactions t
  join accounts a on a.account_id = t.account_id
  where a.mask='5192' and t.amount < 0 and category_detailed not in ('Transfer','Income')
  order by random() limit 8
`);

function overlap(csvRows, mask) {
  return {
    csv: csvRows.length,
    csvFrom: csvRows.at(-1)?.date,
    csvTo: csvRows[0]?.date,
  };
}

const csv = {
  cheq: parseCsv("C:/Users/Work/Documents/1-TASK/My Banking/New folder/cibc.csv"),
  visa1654: parseCsv("C:/Users/Work/Documents/1-TASK/My Banking/New folder/VISA 1654.csv"),
  visa9047: parseCsv("C:/Users/Work/Documents/1-TASK/My Banking/New folder/VISA 9047.csv"),
  mc: parseCsv("C:/Users/Work/Documents/1-TASK/My Banking/New folder/Mastercard 9559.csv"),
  loc: parseCsv("C:/Users/Work/Documents/1-TASK/My Banking/New folder/LOC 52839.csv"),
};

async function matchRate(mask, csvRows, through) {
  const dbRows = await q(
    `select t.date, round(abs(t.amount),2) as amt, lower(t.name) as name
     from transactions t
     join accounts a on a.account_id = t.account_id
     where a.mask = ? and t.date <= ?`,
    [mask, through],
  );
  const csvSlice = csvRows.filter((r) => r.date <= through);
  const dbKeys = new Set(dbRows.map((r) => `${r.date}|${Number(r.amt).toFixed(2)}`));
  let hit = 0;
  for (const row of csvSlice) {
    const key = `${row.date}|${Math.abs(row.amount).toFixed(2)}`;
    if (dbKeys.has(key)) hit += 1;
  }
  return {
    mask,
    csvInWindow: csvSlice.length,
    dbInWindow: dbRows.length,
    csvMatchedByDateAmt: hit,
    matchPct: csvSlice.length
      ? Math.round((1000 * hit) / csvSlice.length) / 10
      : 0,
  };
}

const through = "2026-08-31";
const coverage = {
  cheq: await matchRate("5192", csv.cheq, through),
  visa3945: await matchRate("3945", csv.visa1654, "2025-06-21"),
  mc: await matchRate("9559", csv.mc, through),
  loc: await matchRate("2839", csv.loc, through),
};

const uploadByMask = {};
for (const row of uploads) {
  const key = row.account_mask ?? "?";
  uploadByMask[key] ??= { n: 0, txns: 0, files: [] };
  uploadByMask[key].n += 1;
  uploadByMask[key].txns += Number(row.transaction_count ?? 0);
}

console.log(
  JSON.stringify(
    {
      csvCounts: Object.fromEntries(
        Object.entries(csv).map(([k, rows]) => [
          k,
          { n: rows.length, from: rows.at(-1)?.date, to: rows[0]?.date },
        ]),
      ),
      masks,
      uploadByMask,
      coverage,
      ocrJunk,
      merchantDrift,
      missingMerchant,
      twinCount: twins.length,
      twinMasks: twins.slice(0, 8),
      monthCov,
      visaSample,
      cheqSample,
    },
    null,
    2,
  ),
);
