import { config } from "dotenv";
config({ path: ".env.local" });

import { runCategoryHygienePipeline } from "../src/domains/statements/application/runCategoryHygienePipeline";

async function main() {
  const result = await runCategoryHygienePipeline();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
