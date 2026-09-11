export type ApplyCompanyEntitiesResult = {
  scanned: number;
  matched: number;
  companiesCreated: number;
  linksCreated: number;
  linksUpdated: number;
  skippedUnchanged: number;
};

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function applyCompanyEntities(): Promise<ApplyCompanyEntitiesResult> {
  throw new Error(RETIRED);
}
