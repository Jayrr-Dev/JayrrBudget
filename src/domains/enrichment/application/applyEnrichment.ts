import { eq } from "drizzle-orm";
import {
  upsertEntity,
  upsertTaxonomyNode,
} from "@/domains/enrichment/application/catalog";
import {
  channelFromMirrorTags,
  isChannelMirrorTag,
} from "@/domains/enrichment/domain/channelTags";
import type {
  EnrichmentTxnInput,
  MerchantEnrichmentBatch,
  MerchantEnrichmentItem,
} from "@/domains/enrichment/domain/enrichmentSchema";
import { toSlug } from "@/domains/enrichment/domain/slug";
import { getDb } from "@/shared/db";
import {
  transactionEnrichment,
  transactionLabels,
} from "@/shared/db/schema";

function signedAmount(amount: number) {
  // Statement fact: positive = money out. Analytics signed: spend negative.
  return -amount;
}

function directionFromAmount(amount: number) {
  return amount > 0 ? "outflow" : amount < 0 ? "inflow" : "outflow";
}

async function resolveEntityId(
  ref:
    | {
        slug: string;
        name: string;
        kind: string;
        parentSlug?: string | null;
      }
    | null
    | undefined,
) {
  if (!ref) return null;
  return upsertEntity({
    slug: ref.slug || toSlug(ref.name),
    displayName: ref.name,
    kind: ref.kind,
    parentSlug: ref.parentSlug,
    source: "ai",
  });
}

async function resolveNodeId(
  ref:
    | {
        slug: string;
        name: string;
        facet?: string;
        parentSlug?: string | null;
      }
    | null
    | undefined,
  facet: string,
) {
  if (!ref) return null;
  return upsertTaxonomyNode({
    facet: ref.facet ?? facet,
    slug: ref.slug || toSlug(ref.name),
    name: ref.name,
    parentSlug: ref.parentSlug,
    source: "ai",
  });
}

export async function applyEnrichmentItem(params: {
  txn: EnrichmentTxnInput;
  item: MerchantEnrichmentItem;
  modelId: string | null;
}) {
  const db = getDb();
  const { txn, item, modelId } = params;
  const now = new Date();

  const companyEntityId = await resolveEntityId(item.company);
  const brandEntityId = await resolveEntityId(
    item.brand
      ? {
          ...item.brand,
          parentSlug:
            item.brand.parentSlug ?? item.company?.slug ?? null,
        }
      : null,
  );
  const subsidiaryEntityId = await resolveEntityId(
    item.subsidiary
      ? {
          ...item.subsidiary,
          parentSlug:
            item.subsidiary.parentSlug ?? item.company?.slug ?? null,
        }
      : null,
  );
  const productEntityId = await resolveEntityId(
    item.product
      ? {
          ...item.product,
          parentSlug:
            item.product.parentSlug ?? item.company?.slug ?? null,
        }
      : null,
  );

  const sectionNodeId = await resolveNodeId(item.section, "section");
  const categoryNodeId = await resolveNodeId(
    item.category
      ? {
          ...item.category,
          parentSlug: item.category.parentSlug ?? item.section?.slug ?? null,
        }
      : null,
    "category",
  );
  const typeNodeId = await resolveNodeId(
    item.type
      ? {
          ...item.type,
          parentSlug: item.type.parentSlug ?? item.category?.slug ?? null,
        }
      : null,
    "type",
  );
  const storeTypeNodeId = await resolveNodeId(item.storeType, "store_type");
  const foodTypeNodeId = await resolveNodeId(item.foodType, "food_type");

  const tagNodeIds: { nodeId: number; role: string }[] = [];
  for (const tag of item.tags) {
    if (isChannelMirrorTag(tag.name)) continue;
    const nodeId = await upsertTaxonomyNode({
      facet: "tag",
      slug: tag.slug || toSlug(tag.name),
      name: tag.name,
      source: "ai",
    });
    tagNodeIds.push({ nodeId, role: "tag" });
  }

  const labelPairs = [
    sectionNodeId ? { nodeId: sectionNodeId, role: "section" } : null,
    categoryNodeId ? { nodeId: categoryNodeId, role: "category" } : null,
    typeNodeId ? { nodeId: typeNodeId, role: "type" } : null,
    storeTypeNodeId ? { nodeId: storeTypeNodeId, role: "store_type" } : null,
    foodTypeNodeId ? { nodeId: foodTypeNodeId, role: "food_type" } : null,
    ...tagNodeIds,
  ].filter(Boolean) as { nodeId: number; role: string }[];

  const amount = txn.amount;
  const enrichmentValues = {
    transactionId: txn.id,
    merchantRaw: item.merchantRaw || txn.merchantName || txn.name,
    merchantClean: item.merchantClean,
    companyEntityId,
    brandEntityId,
    subsidiaryEntityId,
    productEntityId,
    storeTypeNodeId,
    foodTypeNodeId,
    sectionNodeId,
    categoryNodeId,
    typeNodeId,
    channel:
      item.channel ??
      channelFromMirrorTags(item.tags.map((tag) => tag.name)) ??
      txn.paymentChannel ??
      "other",
    txnKind: item.txnKind ?? txn.transactionCode ?? "other",
    amountSigned: signedAmount(amount),
    amountAbs: Math.abs(amount),
    direction: directionFromAmount(amount),
    datePosted: txn.date,
    dateAuthorized: txn.authorizedDate,
    locationCity: item.locationCity ?? txn.locationCity,
    locationRegion: item.locationRegion ?? txn.locationRegion,
    locationCountry: item.locationCountry ?? txn.locationCountry,
    storeNumber: item.storeNumber,
    legalSuffix: item.legalSuffix,
    parseTokensJson: JSON.stringify(item.tokens ?? []),
    enrichmentStatus: "done" as const,
    enrichmentConfidence: item.confidence ?? "MEDIUM",
    enrichmentModel: modelId,
    enrichedAt: now,
    error: null,
    updatedAt: now,
  };

  await db
    .insert(transactionEnrichment)
    .values(enrichmentValues)
    .onConflictDoUpdate({
      target: transactionEnrichment.transactionId,
      set: enrichmentValues,
    });

  await db
    .delete(transactionLabels)
    .where(eq(transactionLabels.transactionId, txn.id));

  if (labelPairs.length > 0) {
    await db.insert(transactionLabels).values(
      labelPairs.map((pair) => ({
        transactionId: txn.id,
        nodeId: pair.nodeId,
        role: pair.role,
        confidence: item.confidence ?? "MEDIUM",
        source: "ai",
        createdAt: now,
      })),
    );
  }
}

export async function applyEnrichmentBatch(params: {
  txnsById: Map<number, EnrichmentTxnInput>;
  batch: MerchantEnrichmentBatch;
  modelId: string | null;
}) {
  for (const entity of params.batch.newEntities) {
    await upsertEntity({
      slug: entity.slug,
      displayName: entity.name,
      kind: entity.kind,
      parentSlug: entity.parentSlug,
      source: "ai",
    });
  }

  for (const node of params.batch.newNodes) {
    await upsertTaxonomyNode({
      facet: node.facet,
      slug: node.slug,
      name: node.name,
      parentSlug: node.parentSlug,
      source: "ai",
    });
  }

  for (const item of params.batch.items) {
    const txn = params.txnsById.get(item.transactionId);
    if (!txn) continue;
    try {
      await applyEnrichmentItem({
        txn,
        item,
        modelId: params.modelId,
      });
    } catch (error) {
      await markEnrichmentFailed(
        item.transactionId,
        error instanceof Error ? error.message : "Enrichment apply failed",
      );
    }
  }
}

export async function markEnrichmentFailed(
  transactionId: number,
  error: string,
) {
  const db = getDb();
  const now = new Date();
  await db
    .insert(transactionEnrichment)
    .values({
      transactionId,
      enrichmentStatus: "failed",
      error,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: transactionEnrichment.transactionId,
      set: {
        enrichmentStatus: "failed",
        error,
        updatedAt: now,
      },
    });
}
