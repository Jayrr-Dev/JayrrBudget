import { eq, inArray } from "drizzle-orm";
import {
  applyEnrichmentBatch,
  markEnrichmentFailed,
} from "@/domains/enrichment/application/applyEnrichment";
import { ensureSeedTaxonomy } from "@/domains/enrichment/application/catalog";
import type { EnrichmentTxnInput } from "@/domains/enrichment/domain/enrichmentSchema";
import { enrichMerchantsWithOpenRouter } from "@/domains/enrichment/infrastructure/openRouterEnrich";
import { isOpenRouterConfigured } from "@/shared/ai/openRouter";
import { getDb } from "@/shared/db";
import { transactions } from "@/shared/db/schema";

export type EnrichTransactionsResult =
  | { ok: true; enriched: number; failed: number }
  | { ok: false; error: string };

export async function enrichTransactionsByIds(
  transactionIds: number[],
): Promise<EnrichTransactionsResult> {
  if (transactionIds.length === 0) {
    return { ok: true, enriched: 0, failed: 0 };
  }

  if (!isOpenRouterConfigured()) {
    return {
      ok: false,
      error: "Missing OPENROUTER_API_KEY. Add it to .env.local.",
    };
  }

  await ensureSeedTaxonomy();

  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantName: transactions.merchantName,
      originalDescription: transactions.originalDescription,
      amount: transactions.amount,
      date: transactions.date,
      authorizedDate: transactions.authorizedDate,
      categoryPrimary: transactions.categoryPrimary,
      categoryDetailed: transactions.categoryDetailed,
      paymentChannel: transactions.paymentChannel,
      transactionCode: transactions.transactionCode,
      locationCity: transactions.locationCity,
      locationRegion: transactions.locationRegion,
      locationCountry: transactions.locationCountry,
    })
    .from(transactions)
    .where(inArray(transactions.id, transactionIds));

  const txns: EnrichmentTxnInput[] = rows;
  const txnsById = new Map(txns.map((txn) => [txn.id, txn]));

  let enriched = 0;
  let failed = 0;
  const enrichedIds = new Set<number>();

  try {
    await enrichMerchantsWithOpenRouter(txns, async ({ batch, modelId }) => {
      await applyEnrichmentBatch({ txnsById, batch, modelId });
      for (const item of batch.items) {
        enrichedIds.add(item.transactionId);
      }
      enriched += batch.items.length;
    });

    for (const txn of txns) {
      if (!enrichedIds.has(txn.id)) {
        await markEnrichmentFailed(txn.id, "Missing from enrichment response");
        failed += 1;
      }
    }

    return { ok: true, enriched, failed };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enrichment failed";
    for (const txn of txns) {
      if (enrichedIds.has(txn.id)) continue;
      try {
        await markEnrichmentFailed(txn.id, message);
        failed += 1;
      } catch {
        failed += 1;
      }
    }
    return { ok: false, error: message };
  }
}

export async function enrichTransactionsForUpload(
  statementUploadId: number,
): Promise<EnrichTransactionsResult> {
  const db = getDb();
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.statementUploadId, statementUploadId));

  return enrichTransactionsByIds(rows.map((row) => row.id));
}
