import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve("node_modules/convex/bin/main.js");
for (const table of ["transactionCategories", "transactionSubcategories"]) {
  let cursor = null;
  let scanned = 0;
  while (true) {
    const output = execFileSync(process.execPath, [cli, "run", "categorization:seedVocabulary",
      JSON.stringify({ table, paginationOpts: { cursor, numItems: 100 } })], { encoding: "utf8" });
    const result = JSON.parse(output);
    scanned += result.scanned;
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  console.log(`${table}: published vocabulary from ${scanned} entries`);
}
