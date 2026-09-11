import { eq } from "drizzle-orm";
import { canonicalizeMerchantClean } from "@/domains/enrichment/domain/merchantCleanRules";
import { getDb } from "@/shared/db";
import { transactionEnrichment } from "@/shared/db/schema";

export type MerchantCleanMergeSample = {
  from: string;
  to: string;
  rows: number;
};

export type ApplyMerchantCleanCanonicalizeResult = {
  scanned: number;
  distinctBefore: number;
  rowsUpdated: number;
  mergePairs: number;
  samples: MerchantCleanMergeSample[];
};

/**
 * Rewrite transaction_enrichment.merchant_clean to deterministic canonicals.
 */
export async function applyMerchantCleanCanonicalize(): Promise<ApplyMerchantCleanCanonicalizeResult> {
  const db = getDb();
  const rows = await db
    .select({
      id: transactionEnrichment.id,
      merchantClean: transactionEnrichment.merchantClean,
    })
    .from(transactionEnrichment);

  const distinctBefore = new Set(
    rows
      .map((row) => row.merchantClean?.trim())
      .filter((value): value is string => Boolean(value)),
  ).size;

  const mergeCounts = new Map<string, MerchantCleanMergeSample>();
  let rowsUpdated = 0;

  for (const row of rows) {
    const from = row.merchantClean?.trim() ?? null;
    if (!from) continue;
    const to = canonicalizeMerchantClean(from);
    if (!to || to === from) continue;

    await db
      .update(transactionEnrichment)
      .set({
        merchantClean: to,
        updatedAt: new Date(),
      })
      .where(eq(transactionEnrichment.id, row.id));

    rowsUpdated += 1;
    const key = `${from}\0${to}`;
    const existing = mergeCounts.get(key);
    if (existing) existing.rows += 1;
    else mergeCounts.set(key, { from, to, rows: 1 });
  }

  const samples = [...mergeCounts.values()].sort(
    (a, b) => b.rows - a.rows || a.from.localeCompare(b.from),
  );

  return {
    scanned: rows.length,
    distinctBefore,
    rowsUpdated,
    mergePairs: samples.length,
    samples,
  };
}
