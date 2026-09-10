import { createClient } from "@libsql/client";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const c = createClient({ url: "file:./data/jayrr-budget.db" });

const uploads = (
  await c.execute(
    `select id, filename, status, account_mask, page_count, transaction_count,
            inserted_count, statement_period_start, statement_period_end, balance_ok, error,
            datetime(created_at/1000,'unixepoch') as created
     from statement_uploads
     order by filename`,
  )
).rows;

const ROOT = "C:/Users/Work/Documents/1-TASK/My Banking";

function listPdfs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name.toLowerCase() === "new folder") continue;
      listPdfs(full, acc);
      continue;
    }
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    acc.push({
      folder: path.basename(dir),
      filename: name,
      dup: /\bdup\b/i.test(name),
      full,
    });
  }
  return acc;
}

const pdfs = listPdfs(ROOT);
const byName = new Map(
  uploads.map((u) => [String(u.filename).toLowerCase(), u]),
);

const completed = uploads.filter((u) => u.status === "completed");
const processing = uploads.filter((u) => u.status === "processing");
const failed = uploads.filter(
  (u) => u.status === "failed" || u.status === "error",
);
const other = uploads.filter(
  (u) =>
    u.status !== "completed" &&
    u.status !== "processing" &&
    u.status !== "failed" &&
    u.status !== "error",
);

const uniquePdfs = pdfs.filter((p) => !p.dup);
const missing = uniquePdfs.filter(
  (p) => !byName.has(p.filename.toLowerCase()),
);
const extra = uploads.filter(
  (u) =>
    !pdfs.some(
      (p) => p.filename.toLowerCase() === String(u.filename).toLowerCase(),
    ),
);

const folderStats = {};
for (const p of uniquePdfs) {
  folderStats[p.folder] ??= {
    total: 0,
    completed: 0,
    processing: 0,
    failed: 0,
    missing: 0,
    other: 0,
  };
  folderStats[p.folder].total++;
  const u = byName.get(p.filename.toLowerCase());
  if (!u) folderStats[p.folder].missing++;
  else if (u.status === "completed") folderStats[p.folder].completed++;
  else if (u.status === "processing") folderStats[p.folder].processing++;
  else if (u.status === "failed" || u.status === "error")
    folderStats[p.folder].failed++;
  else folderStats[p.folder].other++;
}

const txns = (await c.execute("select count(*) as n from transactions")).rows[0];
const acct = (
  await c.execute(
    "select mask, name, type, current_balance from accounts order by mask",
  )
).rows;

console.log(
  JSON.stringify(
    {
      uploads: uploads.length,
      completed: completed.length,
      processing: processing.length,
      failed: failed.length,
      other: other.length,
      uniquePdfs: uniquePdfs.length,
      dupsSkippedOnDisk: pdfs.filter((p) => p.dup).map((p) => p.filename),
      missing: missing.map((p) => `${p.folder}/${p.filename}`),
      processingFiles: processing.map((u) => ({
        id: u.id,
        filename: u.filename,
        pages: u.page_count,
        txns: u.transaction_count,
        created: u.created,
        error: u.error,
      })),
      failedFiles: failed.map((u) => ({
        id: u.id,
        filename: u.filename,
        error: u.error,
      })),
      extraInDb: extra.map((u) => u.filename),
      folderStats,
      txnCount: txns.n,
      accounts: acct,
      completedFiles: completed.map((u) => u.filename),
    },
    null,
    2,
  ),
);
