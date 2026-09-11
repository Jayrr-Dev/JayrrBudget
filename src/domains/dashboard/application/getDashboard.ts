import { alias } from "drizzle-orm/sqlite-core";
import { and, count, desc, eq, inArray, max, min } from "drizzle-orm";
import type { DashboardData } from "@/domains/dashboard/domain/types";
import { isChannelMirrorTag } from "@/domains/enrichment/domain/channelTags";
import { toMajor } from "@/shared/db/money";
import { getDb } from "@/shared/db";
import {
  accounts,
  bankHistoryRows,
  entities,
  institutions,
  statementUploads,
  taxonomyNodes,
  transactionAmounts,
  transactionBankCategories,
  transactionDates,
  transactionEntities,
  transactionEnrichment,
  transactionLabels,
  transactionLocations,
  transactionPaymentRefs,
  transactions,
} from "@/shared/db/schema";

export type GetDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: number; error: string };

export async function getDashboard(options?: {
  /** Cap ledger rows. Omit or pass null for every row. */
  transactionLimit?: number | null;
}): Promise<GetDashboardResult> {
  try {
    const db = getDb();
    const companyLink = alias(transactionEntities, "company_link");
    const brandLink = alias(transactionEntities, "brand_link");
    const company = alias(entities, "company_entity");
    const brand = alias(entities, "brand_entity");
    const transactionLimit = options?.transactionLimit;

    const [institutionRows, accountRows, txnRows, stats, statementStats] =
      await Promise.all([
        db
          .select({
            institutionId: institutions.institutionId,
            name: institutions.name,
          })
          .from(institutions),
        db
          .select({
            accountId: accounts.accountId,
            name: accounts.name,
            officialName: accounts.officialName,
            mask: accounts.mask,
            type: accounts.type,
            subtype: accounts.subtype,
            currentBalance: accounts.currentBalance,
            availableBalance: accounts.availableBalance,
            isoCurrencyCode: accounts.isoCurrencyCode,
          })
          .from(accounts),
        (() => {
          const query = db
            .select({
              id: transactions.id,
              transactionId: transactions.transactionId,
              accountId: transactions.accountId,
              name: transactions.description,
              merchantClean: transactionEnrichment.merchantClean,
              companyName: company.displayName,
              brandName: brand.displayName,
              enrichmentStatus: transactionEnrichment.enrichmentStatus,
              amountMinor: transactionAmounts.amountMinor,
              isoCurrencyCode: transactionAmounts.currencyCode,
              date: transactionDates.postedDate,
              authorizedDate: transactionDates.authorizedDate,
              pending: transactions.pending,
              categoryPrimary: transactionBankCategories.categoryPrimary,
              categoryDetailed: transactionBankCategories.categoryDetailed,
              categoryConfidence: transactionBankCategories.categoryConfidence,
              paymentChannel: transactionPaymentRefs.paymentChannel,
              transactionCode: transactionPaymentRefs.transactionCode,
              website: company.website,
              logoUrl: company.logoUrl,
              locationCity: transactionLocations.city,
              locationRegion: transactionLocations.region,
              locationCountry: transactionLocations.country,
              originalDescription: transactions.description,
              source: transactions.source,
              bankDirection: bankHistoryRows.bankDirection,
              historyMatch: bankHistoryRows.matchStatus,
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
            .leftJoin(
              companyLink,
              and(
                eq(companyLink.transactionId, transactions.id),
                eq(companyLink.role, "company"),
              ),
            )
            .leftJoin(company, eq(company.id, companyLink.entityId))
            .leftJoin(
              brandLink,
              and(
                eq(brandLink.transactionId, transactions.id),
                eq(brandLink.role, "brand"),
              ),
            )
            .leftJoin(brand, eq(brand.id, brandLink.entityId))
            .leftJoin(
              bankHistoryRows,
              and(
                eq(bankHistoryRows.matchedTransactionId, transactions.id),
                eq(bankHistoryRows.matchStatus, "matched"),
              ),
            )
            .orderBy(
              desc(transactionDates.postedDate),
              desc(transactions.id),
            );

          if (
            typeof transactionLimit === "number" &&
            Number.isFinite(transactionLimit) &&
            transactionLimit > 0
          ) {
            return query.limit(transactionLimit);
          }
          return query;
        })(),
        db
          .select({
            transactionCount: count(),
            earliestDate: min(transactionDates.postedDate),
            latestDate: max(transactionDates.postedDate),
          })
          .from(transactions)
          .innerJoin(
            transactionDates,
            eq(transactionDates.transactionId, transactions.id),
          ),
        db
          .select({
            latestStatementDate: max(statementUploads.statementPeriodEnd),
          })
          .from(statementUploads)
          .where(eq(statementUploads.status, "completed")),
      ]);

    const txnIds = txnRows.map((row) => row.id);
    const labelRows =
      txnIds.length === 0
        ? []
        : await db
            .select({
              transactionId: transactionLabels.transactionId,
              role: transactionLabels.role,
              name: taxonomyNodes.name,
            })
            .from(transactionLabels)
            .innerJoin(
              taxonomyNodes,
              eq(taxonomyNodes.id, transactionLabels.nodeId),
            )
            .where(inArray(transactionLabels.transactionId, txnIds));

    const tagsByTxn = new Map<number, string[]>();
    const treeByTxn = new Map<
      number,
      { sectionName: string | null; categoryName: string | null; typeName: string | null }
    >();

    for (const row of labelRows) {
      if (row.role === "tag") {
        if (!row.name || isChannelMirrorTag(row.name)) continue;
        const list = tagsByTxn.get(row.transactionId) ?? [];
        if (!list.includes(row.name)) list.push(row.name);
        tagsByTxn.set(row.transactionId, list);
        continue;
      }

      const tree = treeByTxn.get(row.transactionId) ?? {
        sectionName: null,
        categoryName: null,
        typeName: null,
      };
      if (row.role === "section") tree.sectionName = row.name;
      if (row.role === "category") tree.categoryName = row.name;
      if (row.role === "type") tree.typeName = row.name;
      treeByTxn.set(row.transactionId, tree);
    }

    const data: DashboardData = {
      institutions: institutionRows,
      accounts: accountRows,
      transactions: txnRows.map(({ id, amountMinor, merchantClean, ...txn }) => {
        const tree = treeByTxn.get(id) ?? {
          sectionName: null,
          categoryName: null,
          typeName: null,
        };
        return {
          ...txn,
          merchantName: null,
          merchantClean,
          sectionName: tree.sectionName,
          categoryName: tree.categoryName,
          typeName: tree.typeName,
          amount: toMajor(amountMinor),
          tagNames: (tagsByTxn.get(id) ?? []).sort((a, b) =>
            a.localeCompare(b),
          ),
        };
      }),
      totalBalance: accountRows.reduce(
        (sum, account) => sum + (account.currentBalance ?? 0),
        0,
      ),
      transactionCount: Number(stats[0]?.transactionCount ?? 0),
      earliestDate: stats[0]?.earliestDate ?? null,
      latestDate: stats[0]?.latestDate ?? null,
      latestStatementDate: statementStats[0]?.latestStatementDate ?? null,
    };

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Database unavailable. Run npm run db:push first.",
    };
  }
}
