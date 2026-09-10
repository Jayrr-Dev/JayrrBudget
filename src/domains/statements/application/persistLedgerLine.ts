import { eq } from "drizzle-orm";
import { toMinor } from "@/shared/db/money";
import { getDb } from "@/shared/db";
import {
  transactionAmounts,
  transactionBankCategories,
  transactionDates,
  transactionEnrichment,
  transactionLocations,
  transactionPaymentRefs,
  transactions,
} from "@/shared/db/schema";

export type LedgerLineInput = {
  externalId: string;
  accountId: string;
  description: string;
  pending: boolean;
  source?: string;
  statementUploadId: number | null;
  amount: number;
  currencyCode: string;
  runningBalance?: number | null;
  postedDate: string;
  authorizedDate?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  checkNumber?: string | null;
  referenceNumber?: string | null;
  transactionCode?: string | null;
  paymentChannel?: string | null;
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  categoryConfidence?: string | null;
  /** Parse-time cleaned merchant; seeds enrichment without full AI pass. */
  merchantClean?: string | null;
};

async function upsertAtoms(
  db: ReturnType<typeof getDb>,
  transactionPk: number,
  line: LedgerLineInput,
) {
  const amountMinor = toMinor(line.amount);
  const runningBalanceMinor =
    line.runningBalance == null ? null : toMinor(line.runningBalance);
  const foreignAmountMinor =
    line.foreignAmount == null ? null : toMinor(line.foreignAmount);

  await db
    .insert(transactionAmounts)
    .values({
      transactionId: transactionPk,
      amountMinor,
      currencyCode: line.currencyCode,
      runningBalanceMinor,
    })
    .onConflictDoUpdate({
      target: transactionAmounts.transactionId,
      set: {
        amountMinor,
        currencyCode: line.currencyCode,
        runningBalanceMinor,
      },
    });

  await db
    .insert(transactionDates)
    .values({
      transactionId: transactionPk,
      postedDate: line.postedDate,
      authorizedDate: line.authorizedDate ?? null,
    })
    .onConflictDoUpdate({
      target: transactionDates.transactionId,
      set: {
        postedDate: line.postedDate,
        authorizedDate: line.authorizedDate ?? null,
      },
    });

  const hasLocation =
    line.locationCity || line.locationRegion || line.locationCountry;
  if (hasLocation) {
    await db
      .insert(transactionLocations)
      .values({
        transactionId: transactionPk,
        city: line.locationCity ?? null,
        region: line.locationRegion ?? null,
        country: line.locationCountry ?? null,
      })
      .onConflictDoUpdate({
        target: transactionLocations.transactionId,
        set: {
          city: line.locationCity ?? null,
          region: line.locationRegion ?? null,
          country: line.locationCountry ?? null,
        },
      });
  }

  await db
    .insert(transactionPaymentRefs)
    .values({
      transactionId: transactionPk,
      checkNumber: line.checkNumber ?? null,
      referenceNumber: line.referenceNumber ?? null,
      transactionCode: line.transactionCode ?? null,
      paymentChannel: line.paymentChannel ?? null,
      foreignAmountMinor,
      foreignCurrency: line.foreignCurrency ?? null,
    })
    .onConflictDoUpdate({
      target: transactionPaymentRefs.transactionId,
      set: {
        checkNumber: line.checkNumber ?? null,
        referenceNumber: line.referenceNumber ?? null,
        transactionCode: line.transactionCode ?? null,
        paymentChannel: line.paymentChannel ?? null,
        foreignAmountMinor,
        foreignCurrency: line.foreignCurrency ?? null,
      },
    });

  if (
    line.categoryPrimary ||
    line.categoryDetailed ||
    line.categoryConfidence
  ) {
    await db
      .insert(transactionBankCategories)
      .values({
        transactionId: transactionPk,
        categoryPrimary: line.categoryPrimary ?? null,
        categoryDetailed: line.categoryDetailed ?? null,
        categoryConfidence: line.categoryConfidence ?? null,
      })
      .onConflictDoUpdate({
        target: transactionBankCategories.transactionId,
        set: {
          categoryPrimary: line.categoryPrimary ?? null,
          categoryDetailed: line.categoryDetailed ?? null,
          categoryConfidence: line.categoryConfidence ?? null,
        },
      });
  }

  if (line.merchantClean) {
    const now = new Date();
    await db
      .insert(transactionEnrichment)
      .values({
        transactionId: transactionPk,
        merchantRaw: line.description,
        merchantClean: line.merchantClean,
        enrichmentStatus: "pending",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: transactionEnrichment.transactionId,
        set: {
          merchantRaw: line.description,
          merchantClean: line.merchantClean,
          updatedAt: now,
        },
      });
  }
}

export async function insertLedgerLine(line: LedgerLineInput): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(transactions)
    .values({
      transactionId: line.externalId,
      accountId: line.accountId,
      description: line.description,
      pending: line.pending,
      source: line.source ?? "statement",
      statementUploadId: line.statementUploadId,
      updatedAt: new Date(),
    })
    .returning({ id: transactions.id });

  await upsertAtoms(db, row.id, line);
  return row.id;
}

export async function updateLedgerLine(
  transactionPk: number,
  line: LedgerLineInput,
): Promise<void> {
  const db = getDb();
  await db
    .update(transactions)
    .set({
      transactionId: line.externalId,
      accountId: line.accountId,
      description: line.description,
      pending: line.pending,
      source: line.source ?? "statement",
      statementUploadId: line.statementUploadId,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionPk));

  await upsertAtoms(db, transactionPk, line);
}
