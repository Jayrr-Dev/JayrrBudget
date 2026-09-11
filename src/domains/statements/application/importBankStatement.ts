export type {
  ImportBankStatementResult,
  ImportBankStatementSuccess,
  ImportEnrichmentSummary,
  ImportHygieneSummary,
} from "@/domains/statements/domain/importResult";

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function importBankStatement(_params: {
  filename: string;
  bytes: Buffer;
  /** Skip hygiene + enrichment. Use for bulk import, then run those once. */
  skipPostProcess?: boolean;
  /** Folder or product hint, e.g. visa1654 or loc52839. */
  sourceHint?: string;
}): Promise<
  import("@/domains/statements/domain/importResult").ImportBankStatementResult
> {
  throw new Error(RETIRED);
}
