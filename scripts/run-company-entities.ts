import { config } from "dotenv";
config({ path: ".env.local" });

import { applyCompanyEntities } from "../src/domains/enrichment/application/applyCompanyEntities";

async function main() {
  const result = await applyCompanyEntities();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
