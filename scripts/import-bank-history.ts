import { config } from "dotenv";
config({ path: ".env.local" });

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { importBankHistoryFile } from "../src/domains/bank-history/application/importBankHistory";
import { reconcileBankHistory } from "../src/domains/bank-history/application/reconcileBankHistory";
import { accountHintFromFilename } from "../src/domains/bank-history/domain/parseCibcCsv";

const ROOT = path.resolve("C:/Users/Work/Documents/1-TASK/My Banking/Transactions");

async function main() {
  const entries = await readdir(ROOT);
  const files = entries
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No CSV files in ${ROOT}`);
  }

  for (const filename of files) {
    const hint = accountHintFromFilename(filename);
    const bytes = await readFile(path.join(ROOT, filename));
    const result = await importBankHistoryFile({ filename, bytes, hint });
    console.log(
      `history ${filename} mask=${result.accountMask} type=${result.accountType} rows=${result.inserted}`,
    );
  }

  const reconcile = await reconcileBankHistory();
  console.log(
    `reconcile history=${reconcile.historyRows} matched=${reconcile.matched} csvOnly=${reconcile.historyUnmatched} pdfOnly=${reconcile.statementExtra} signsFlipped=${reconcile.signsFlipped}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
