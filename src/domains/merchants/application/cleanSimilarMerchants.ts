import { MERCHANT_CLEAN_AI_RULES } from "@/domains/enrichment/domain/merchantCleanAiRules";
import { clusterSimilarMerchants } from "@/domains/merchants/domain/clusterSimilarMerchants";
import { planDescriptorCleanMerges } from "@/domains/merchants/domain/planDescriptorCleanMerges";
import { generateObjectWithFallback } from "@/shared/ai/openRouter";
import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import type { Id } from "@convex/_generated/dataModel";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

const AI_CLUSTER_CHUNK = 28;
const MERGE_TXN_LIMIT = 80;

const mergeSchema = z.object({
  merges: z
    .array(
      z.object({
        canonicalName: z
          .string()
          .describe("Short brand/payee title to keep. Title Case."),
        merchantIds: z
          .array(z.string())
          .describe("Ids from the proposed cluster that are the same payee."),
      }),
    )
    .describe(
      "Only real same-payee merges. Empty if every name is already distinct.",
    ),
});

export type MerchantCleanMerge = {
  canonicalName: string;
  fromNames: string[];
  transactionsUpdated: number;
  merchantsDeleted: number;
};

export type CleanSimilarMerchantsResult = {
  clustersFound: number;
  mergesApplied: number;
  merchantsDeleted: number;
  transactionsUpdated: number;
  merges: MerchantCleanMerge[];
};

type ListedMerchant = {
  id: Id<"merchants">;
  name: string;
  slug: string;
  transactionCount: number;
};

function pickKeeper(
  members: ListedMerchant[],
  canonicalName: string,
): ListedMerchant {
  const exact = members.find(
    (member) =>
      member.name.trim().toLowerCase() === canonicalName.trim().toLowerCase(),
  );
  if (exact) return exact;
  return [...members].sort((a, b) => {
    if (b.transactionCount !== a.transactionCount) {
      return b.transactionCount - a.transactionCount;
    }
    return a.name.length - b.name.length;
  })[0]!;
}

async function askAiMerges(
  clusters: Array<{
    clusterId: number;
    members: Array<{ id: string; name: string; transactionCount: number }>;
  }>,
) {
  const prompt = [
    "You consolidate a personal-finance merchant list.",
    "Each CLUSTER is a fuzzy-search guess that names might be the same payee.",
    "Merge only when they are the same store/brand (typos, location, store number, punctuation, McDonald's vs Mcdonalds).",
    "Do NOT merge distinct services or brands (Uber vs Uber Eats, Amazon vs Audible unless they are clearly the same payee in this list).",
    "Do NOT merge a bank with a different bank. Do NOT invent merchants that are not in the cluster.",
    "canonicalName is a short brand title. merchantIds must be ids from that cluster.",
    "Skip a cluster entirely when members are different payees.",
    MERCHANT_CLEAN_AI_RULES,
    "",
    "CLUSTERS:",
    ...clusters.map((cluster) =>
      JSON.stringify({
        clusterId: cluster.clusterId,
        members: cluster.members,
      }),
    ),
  ].join("\n");

  const { object } = await generateObjectWithFallback({
    schema: mergeSchema,
    logLabel: "merchant-clean",
    prompt,
  });
  return object.merges;
}

async function drainCluster(
  _client: ConvexHttpClient,
  _keeperId: Id<"merchants">,
  _sourceIds: Id<"merchants">[],
  _name: string,
): Promise<{
  keeperId: Id<"merchants">;
  keeperName: string;
  transactionsUpdated: number;
  merchantsDeleted: number;
}> {
  throw new Error(
    "mergeCluster is retired. Use the private ledger (vault) merchant clean.",
  );
}

export type PlannedMerchantMerge = {
  canonicalName: string;
  merchantIds: string[];
};

export type PlanSimilarMerchantsResult = {
  clustersFound: number;
  merges: PlannedMerchantMerge[];
};

export async function planSimilarMerchantMerges(
  listed: Array<{
    id: string;
    name: string;
    slug: string;
    transactionCount: number;
  }>,
): Promise<PlanSimilarMerchantsResult> {
  const descriptorMerges = planDescriptorCleanMerges(listed);
  const claimed = new Set(
    descriptorMerges.flatMap((merge) => merge.merchantIds),
  );
  const remaining = listed.filter((merchant) => !claimed.has(merchant.id));
  const clusters = clusterSimilarMerchants(remaining);
  if (clusters.length === 0) {
    return {
      clustersFound: descriptorMerges.length,
      merges: descriptorMerges,
    };
  }

  const payload = clusters.map((cluster, clusterId) => ({
    clusterId,
    members: cluster.members.map((member) => ({
      id: member.id,
      name: member.name,
      transactionCount: member.transactionCount,
    })),
  }));

  const aiMerges: PlannedMerchantMerge[] = [];
  for (let offset = 0; offset < payload.length; offset += AI_CLUSTER_CHUNK) {
    const chunk = payload.slice(offset, offset + AI_CLUSTER_CHUNK);
    const allowed = new Map(
      chunk.map((cluster) => [
        cluster.clusterId,
        new Set(cluster.members.map((member) => member.id)),
      ]),
    );
    const raw = await askAiMerges(chunk);
    for (const merge of raw) {
      const ids = [...new Set(merge.merchantIds.map((id) => id.trim()))].filter(
        Boolean,
      );
      let home: Set<string> | null = null;
      let homeHits = 0;
      for (const set of allowed.values()) {
        const hits = ids.filter((id) => set.has(id)).length;
        if (hits > homeHits) {
          home = set;
          homeHits = hits;
        }
      }
      const inCluster = home ? ids.filter((id) => home.has(id)) : [];
      if (inCluster.length < 2) continue;
      const canonicalName = merge.canonicalName.trim();
      if (!canonicalName) continue;
      aiMerges.push({ canonicalName, merchantIds: inCluster });
    }
  }

  return {
    clustersFound: clusters.length + descriptorMerges.length,
    merges: [...descriptorMerges, ...aiMerges],
  };
}

export async function cleanSimilarMerchants(
  client: ConvexHttpClient,
): Promise<CleanSimilarMerchantsResult> {
  const listed = (await client.query(
    api.merchants.list,
    {},
  )) as ListedMerchant[];
  const { clustersFound, merges: aiMerges } =
    await planSimilarMerchantMerges(listed);
  const empty: CleanSimilarMerchantsResult = {
    clustersFound,
    mergesApplied: 0,
    merchantsDeleted: 0,
    transactionsUpdated: 0,
    merges: [],
  };
  if (aiMerges.length === 0) {
    await invalidateConvexUserCache();
    return empty;
  }

  const byId = new Map(listed.map((merchant) => [merchant.id, merchant]));

  const applied: MerchantCleanMerge[] = [];
  let merchantsDeleted = 0;
  let transactionsUpdated = 0;

  for (const merge of aiMerges) {
    const members = merge.merchantIds
      .map((id) => byId.get(id as Id<"merchants">))
      .filter((row): row is ListedMerchant => row != null);
    if (members.length === 0) continue;
    const canonicalName = merge.canonicalName.trim();
    if (
      members.length === 1 &&
      members[0]!.name.trim().toLowerCase() === canonicalName.toLowerCase()
    ) {
      continue;
    }

    const keeper = pickKeeper(members, canonicalName);
    const sourceIds = members
      .filter((member) => member.id !== keeper.id)
      .map((member) => member.id);

    const drained = await drainCluster(
      client,
      keeper.id,
      sourceIds,
      canonicalName,
    );

    for (const member of members) {
      if (member.id !== drained.keeperId) byId.delete(member.id);
    }
    byId.set(drained.keeperId, {
      id: drained.keeperId,
      name: drained.keeperName,
      slug: keeper.slug,
      transactionCount: keeper.transactionCount,
    });

    applied.push({
      canonicalName: drained.keeperName,
      fromNames: members.map((member) => member.name),
      transactionsUpdated: drained.transactionsUpdated,
      merchantsDeleted: drained.merchantsDeleted,
    });
    merchantsDeleted += drained.merchantsDeleted;
    transactionsUpdated += drained.transactionsUpdated;
  }

  await invalidateConvexUserCache();
  return {
    clustersFound,
    mergesApplied: applied.length,
    merchantsDeleted,
    transactionsUpdated,
    merges: applied,
  };
}
