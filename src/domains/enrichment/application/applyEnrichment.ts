import type {
  EnrichmentTxnInput,
  MerchantEnrichmentBatch,
  MerchantEnrichmentItem,
} from "@/domains/enrichment/domain/enrichmentSchema";

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

export async function applyEnrichmentItem(_params: {
  txn: EnrichmentTxnInput;
  item: MerchantEnrichmentItem;
  modelId: string | null;
}) {
  throw new Error(RETIRED);
}

export async function applyEnrichmentBatch(_params: {
  txnsById: Map<number, EnrichmentTxnInput>;
  batch: MerchantEnrichmentBatch;
  modelId: string | null;
}) {
  throw new Error(RETIRED);
}

export async function markEnrichmentFailed(
  _transactionId: number,
  _error: string,
) {
  throw new Error(RETIRED);
}
