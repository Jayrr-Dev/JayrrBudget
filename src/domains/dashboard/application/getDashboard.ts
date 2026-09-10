import { alias } from "drizzle-orm/sqlite-core";
import { and, count, desc, eq, inArray, max, min } from "drizzle-orm";
import type { DashboardData } from "@/domains/dashboard/domain/types";
import { isChannelMirrorTag } from "@/domains/enrichment/domain/channelTags";
import { getDb } from "@/shared/db";
import {
  accounts,
  entities,
  institutions,
  taxonomyNodes,
  transactionEnrichment,
  transactionLabels,
  transactions,
} from "@/shared/db/schema";

export type GetDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; status: number; error: string };

export async function getDashboard(): Promise<GetDashboardResult> {
  try {
    const db = getDb();
    const company = alias(entities, "company_entity");
    const brand = alias(entities, "brand_entity");
    const section = alias(taxonomyNodes, "section_node");
    const category = alias(taxonomyNodes, "category_node");
    const typeNode = alias(taxonomyNodes, "type_node");

    const [institutionRows, accountRows, txnRows, stats] = await Promise.all([
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
      db
        .select({
          id: transactions.id,
          transactionId: transactions.transactionId,
          accountId: transactions.accountId,
          name: transactions.name,
          merchantName: transactions.merchantName,
          merchantClean: transactionEnrichment.merchantClean,
          companyName: company.displayName,
          brandName: brand.displayName,
          sectionName: section.name,
          categoryName: category.name,
          typeName: typeNode.name,
          enrichmentStatus: transactionEnrichment.enrichmentStatus,
          amount: transactions.amount,
          isoCurrencyCode: transactions.isoCurrencyCode,
          date: transactions.date,
          authorizedDate: transactions.authorizedDate,
          pending: transactions.pending,
          categoryPrimary: transactions.categoryPrimary,
          categoryDetailed: transactions.categoryDetailed,
          categoryConfidence: transactions.categoryConfidence,
          paymentChannel: transactions.paymentChannel,
          transactionCode: transactions.transactionCode,
          website: transactions.website,
          logoUrl: transactions.logoUrl,
          locationCity: transactions.locationCity,
          locationRegion: transactions.locationRegion,
          locationCountry: transactions.locationCountry,
          originalDescription: transactions.originalDescription,
          source: transactions.source,
          bankDirection: transactions.bankDirection,
          historyMatch: transactions.historyMatch,
        })
        .from(transactions)
        .leftJoin(
          transactionEnrichment,
          eq(transactionEnrichment.transactionId, transactions.id),
        )
        .leftJoin(
          company,
          eq(company.id, transactionEnrichment.companyEntityId),
        )
        .leftJoin(brand, eq(brand.id, transactionEnrichment.brandEntityId))
        .leftJoin(
          section,
          eq(section.id, transactionEnrichment.sectionNodeId),
        )
        .leftJoin(
          category,
          eq(category.id, transactionEnrichment.categoryNodeId),
        )
        .leftJoin(typeNode, eq(typeNode.id, transactionEnrichment.typeNodeId))
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(250),
      db
        .select({
          transactionCount: count(),
          earliestDate: min(transactions.date),
          latestDate: max(transactions.date),
        })
        .from(transactions),
    ]);

    const txnIds = txnRows.map((row) => row.id);
    const tagRows =
      txnIds.length === 0
        ? []
        : await db
            .select({
              transactionId: transactionLabels.transactionId,
              tagName: taxonomyNodes.name,
            })
            .from(transactionLabels)
            .innerJoin(
              taxonomyNodes,
              eq(taxonomyNodes.id, transactionLabels.nodeId),
            )
            .where(
              and(
                inArray(transactionLabels.transactionId, txnIds),
                eq(transactionLabels.role, "tag"),
              ),
            );

    const tagsByTxn = new Map<number, string[]>();
    for (const row of tagRows) {
      if (!row.tagName || isChannelMirrorTag(row.tagName)) continue;
      const list = tagsByTxn.get(row.transactionId) ?? [];
      if (!list.includes(row.tagName)) list.push(row.tagName);
      tagsByTxn.set(row.transactionId, list);
    }

    const data: DashboardData = {
      institutions: institutionRows,
      accounts: accountRows,
      transactions: txnRows.map(({ id, ...txn }) => ({
        ...txn,
        tagNames: (tagsByTxn.get(id) ?? []).sort((a, b) =>
          a.localeCompare(b),
        ),
      })),
      totalBalance: accountRows.reduce(
        (sum, account) => sum + (account.currentBalance ?? 0),
        0,
      ),
      transactionCount: Number(stats[0]?.transactionCount ?? 0),
      earliestDate: stats[0]?.earliestDate ?? null,
      latestDate: stats[0]?.latestDate ?? null,
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
