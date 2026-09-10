import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { importBankStatement } from "../src/domains/statements/application/importBankStatement";
import { enrichTransactionsByIds } from "../src/domains/enrichment/application/enrichTransactions";
import { runCategoryHygienePipeline } from "../src/domains/statements/application/runCategoryHygienePipeline";
import { reconcileBankHistory } from "../src/domains/bank-history/application/reconcileBankHistory";
import { getDb } from "../src/shared/db";
import { transactions } from "../src/shared/db/schema";
import { errorMessage } from "../src/shared/lib/error-message";

const ROOT = path.resolve("C:/Users/Work/Documents/1-TASK/My Banking");
const LOG_DIR = path.resolve("data");
const LOG_FILE = path.join(LOG_DIR, "bulk-import.log");

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

type PdfJob = {
  fullPath: string;
  filename: string;
  sortKey: string;
};

function dbClient() {
  return createClient({
    url: process.env.DATABASE_URL ?? "file:./data/jayrr-budget.db",
    timeout: 60_000,
    ...(process.env.DATABASE_AUTH_TOKEN
      ? { authToken: process.env.DATABASE_AUTH_TOKEN }
      : {}),
  });
}

async function log(line: string) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(LOG_FILE, `${stamped}\n`, { flag: "a" });
}

function teeConsole() {
  for (const method of ["log", "info", "warn", "error"] as const) {
    const orig = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      orig(...args);
      const line = args
        .map((value) => (typeof value === "string" ? value : String(value)))
        .join(" ");
      void writeFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`, {
        flag: "a",
      }).catch(() => {});
    };
  }
}

function parseSortKey(filename: string) {
  const match = filename.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s+(20\d{2})\b/i,
  );
  if (!match) return `9999-99-99-${filename.toLowerCase()}`;
  const month = MONTHS[match[1].toLowerCase().slice(0, 3)] ?? 99;
  const day = String(Number(match[2])).padStart(2, "0");
  const year = match[3];
  return `${year}-${String(month).padStart(2, "0")}-${day}-${filename.toLowerCase()}`;
}

async function listPdfs(dir: string): Promise<PdfJob[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const jobs: PdfJob[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "new folder") continue;
      jobs.push(...(await listPdfs(fullPath)));
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".pdf")) continue;
    if (/\bdup\b/i.test(entry.name)) continue;
    jobs.push({
      fullPath,
      filename: entry.name,
      sortKey: `${path.basename(dir)}-${parseSortKey(entry.name)}`,
    });
  }

  return jobs;
}

async function wipeLedger() {
  const client = dbClient();
  await client.execute("PRAGMA foreign_keys = ON");
  const tables = [
    "transaction_labels",
    "transaction_enrichment",
    "transactions",
    "statement_uploads",
    "accounts",
    "institutions",
    "entities",
    "taxonomy_nodes",
  ];
  for (const table of tables) {
    await client.execute(`DELETE FROM ${table}`);
  }
  const after = await client.execute(
    `select
      (select count(*) from transactions) as txns,
      (select count(*) from statement_uploads) as uploads,
      (select count(*) from accounts) as accounts,
      (select count(*) from institutions) as items`,
  );
  return after.rows[0];
}

async function main() {
  const started = Date.now();
  await mkdir(LOG_DIR, { recursive: true });
  teeConsole();

  setInterval(() => {
    void writeFile(
      path.join(LOG_DIR, "bulk-import.heartbeat"),
      new Date().toISOString(),
    );
  }, 10_000).unref();

  process.on("uncaughtException", (error) => {
    console.error("uncaughtException", error);
    void log(`uncaughtException ${errorMessage(error)}`);
  });
  process.on("unhandledRejection", (error) => {
    console.error("unhandledRejection", error);
    void log(`unhandledRejection ${errorMessage(error)}`);
  });

  const resume = process.argv.includes("--resume");
  const skipPost = process.argv.includes("--skip-post");
  const onlyIndex = process.argv.indexOf("--only");
  const onlyFilename =
    onlyIndex >= 0 ? process.argv[onlyIndex + 1]?.toLowerCase() : null;
  if (!resume) {
    await writeFile(LOG_FILE, "");
    await log("wipe ledger (keep app_modules)");
    const wiped = await wipeLedger();
    await log(`wiped ${JSON.stringify(wiped)}`);
  } else {
    await log("resume: keep completed uploads, retry the rest");
    const client = dbClient();
    await client.execute("PRAGMA busy_timeout = 60000");
    await client.execute(
      "DELETE FROM statement_uploads WHERE status != 'completed'",
    );
  }

  let jobs = (await listPdfs(ROOT)).sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey),
  );
  if (onlyFilename) {
    jobs = jobs.filter((job) => job.filename.toLowerCase() === onlyFilename);
    await log(`--only ${onlyFilename} matched=${jobs.length}`);
  }
  await log(`pdfs queued=${jobs.length} root=${ROOT}`);

  const results: Array<{
    filename: string;
    ok: boolean;
    ms: number;
    detail: string;
  }> = [];

  for (const [index, job] of jobs.entries()) {
    const n = `${index + 1}/${jobs.length}`;
    const fileStarted = Date.now();
    await log(`[${n}] start ${job.filename}`);

    try {
      const bytes = await readFile(job.fullPath);
      const result = await importBankStatement({
        filename: job.filename,
        bytes,
        skipPostProcess: true,
        sourceHint: `${path.basename(path.dirname(job.fullPath))} ${job.filename}`,
      });
      const ms = Date.now() - fileStarted;

      if (!result.ok) {
        const detail = `${result.status} ${result.code ?? ""} ${result.error}`.trim();
        results.push({ filename: job.filename, ok: false, ms, detail });
        await log(`[${n}] FAIL ${job.filename} ${ms}ms ${detail}`);
        continue;
      }

      if (result.duplicateFile) {
        results.push({
          filename: job.filename,
          ok: true,
          ms,
          detail: "skip completed",
        });
        await log(`[${n}] SKIP ${job.filename} already imported`);
        continue;
      }

      const detail = [
        `upload=${result.uploadId}`,
        `txns=${result.transactionCount}`,
        `new=${result.insertedCount}`,
        `pages=${result.pageCount}`,
        `balance=${result.balanceOk}`,
        result.duplicateFile ? "duplicate" : "",
        result.institutionName ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      results.push({ filename: job.filename, ok: true, ms, detail });
      await log(`[${n}] OK ${job.filename} ${ms}ms ${detail}`);
    } catch (error) {
      const ms = Date.now() - fileStarted;
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ filename: job.filename, ok: false, ms, detail });
      await log(`[${n}] THROW ${job.filename} ${ms}ms ${detail}`);
    }
  }

  const failed = results.filter((row) => !row.ok);
  await log(
    `import done ok=${results.length - failed.length} fail=${failed.length} elapsed=${Math.round((Date.now() - started) / 1000)}s`,
  );

  try {
    await log("history cross-check start");
    const rec = await reconcileBankHistory();
    await log(
      `history matched=${rec.matched} csvOnly=${rec.historyUnmatched} pdfOnly=${rec.statementExtra} flipped=${rec.signsFlipped}`,
    );
  } catch (error) {
    await log(
      `history FAIL ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (skipPost) {
    await log("skip post-process");
    if (failed.length) {
      await log("failures:");
      for (const row of failed) {
        await log(`  ${row.filename} ${row.detail}`);
      }
    }
    await log(`all done elapsed=${Math.round((Date.now() - started) / 1000)}s`);
    return;
  }

  const db = getDb();
  await db.$client.execute("PRAGMA busy_timeout = 60000");
  const ids = (await db.select({ id: transactions.id }).from(transactions)).map(
    (row) => row.id,
  );
  await log(`post-process txns=${ids.length}`);

  try {
    await log("hygiene start");
    const hygiene = await runCategoryHygienePipeline();
    await log(
      `hygiene merges=${hygiene.consolidate.mergesApplied} rules=${hygiene.rules.matched} ai=${hygiene.aiClean.updated} warnings=${hygiene.warnings.length}`,
    );
  } catch (error) {
    await log(
      `hygiene FAIL ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await log("enrichment start");
    const enrichment = await enrichTransactionsByIds(ids);
    if (enrichment.ok) {
      await log(
        `enrichment enriched=${enrichment.enriched} failed=${enrichment.failed}`,
      );
    } else {
      await log(`enrichment FAIL ${enrichment.error}`);
    }
  } catch (error) {
    await log(
      `enrichment THROW ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (failed.length) {
    await log("failures:");
    for (const row of failed) {
      await log(`  ${row.filename} ${row.detail}`);
    }
  }

  await log(`all done elapsed=${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
