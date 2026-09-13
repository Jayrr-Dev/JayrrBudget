import { config } from "dotenv";
import { getAnalysis } from "../src/domains/analysis/application/getAnalysis";
config({ path: ".env.local" });

async function main() {
  const r = await getAnalysis("3m", "monthly");
  if (!r.ok) throw new Error(r.error);
  console.log(
    JSON.stringify(
      {
        spreads: r.data.spreads,
        series: r.data.spreadSeries,
        stackedRows: r.data.spreadStacked.rows.length,
        catsNeeds: r.data.categoriesBySpread.Needs?.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
