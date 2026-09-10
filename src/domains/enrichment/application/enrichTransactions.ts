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
import { toMajor } from "@/shared/db/money";
import {
  transactionAmounts,
  transactionBankCategories,
  transactionDates,
  transactionEnrichment,
  transactionLocations,
  transactionPaymentRefs,
  transactions,
} from "@/shared/db/schema";

export type EnrichTransactionsResult =
  | { ok: true; enriched: number; failed: number }
  | { ok: false; error: string };

function mapRowToEnrichmentInput(row: {
  id: number;
  description: string;
  amountMinor: number;
  postedDate: string;
  authorizedDate: string | null;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  paymentChannel: string | null;
  transactionCode: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  merchantRaw: string | null;
  merchantClean: string | null;
}): EnrichmentTxnInput {
  return {
    id: row.id,
    name: row.description,
    merchantName: row.merchantClean ?? row.merchantRaw,
    originalDescription: row.description,
    amount: toMajor(row.amountMinor),
    date: row.postedDate,
    authorizedDate: row.authorizedDate,
    categoryPrimary: row.categoryPrimary,
    categoryDetailed: row.categoryDetailed,
    paymentChannel: row.paymentChannel,
    transactionCode: row.transactionCode,
    locationCity: row.locationCity,
    locationRegion: row.locationRegion,
    locationCountry: row.locationCountry,
  };
}

async function loadEnrichmentTxnInputs(
  transactionIds: number[],
): Promise<EnrichmentTxnInput[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amountMinor: transactionAmounts.amountMinor,
      postedDate: transactionDates.postedDate,
      authorizedDate: transactionDates.authorizedDate,
      categoryPrimary: transactionBankCategories.categoryPrimary,
      categoryDetailed: transactionBankCategories.categoryDetailed,
      paymentChannel: transactionPaymentRefs.paymentChannel,
      transactionCode: transactionPaymentRefs.transactionCode,
      locationCity: transactionLocations.city,
      locationRegion: transactionLocations.region,
      locationCountry: transactionLocations.country,
      merchantRaw: transactionEnrichment.merchantRaw,
      merchantClean: transactionEnrichment.merchantClean,
    })
    .from(transactions)
    .innerJoin(
      transactionAmounts,
      eq(transactionAmounts.transactionId, transactions.id),
    )
    .innerJoin(
      transactionDates,
      eq(transactionDates.transactionId, transactions.id),
    )
    .leftJoin(
      transactionLocations,
      eq(transactionLocations.transactionId, transactions.id),
    )
    .leftJoin(
      transactionPaymentRefs,
      eq(transactionPaymentRefs.transactionId, transactions.id),
    )
    .leftJoin(
      transactionBankCategories,
      eq(transactionBankCategories.transactionId, transactions.id),
    )
    .leftJoin(
      transactionEnrichment,
      eq(transactionEnrichment.transactionId, transactions.id),
    )
    .where(inArray(transactions.id, transactionIds));

  return rows.map(mapRowToEnrichmentInput);
}

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

  const txns = await loadEnrichmentTxnInputs(transactionIds);
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
