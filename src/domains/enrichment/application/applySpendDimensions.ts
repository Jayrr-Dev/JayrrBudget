import { and, eq, inArray } from "drizzle-orm";
import {
  ensureSeedTaxonomy,
  upsertTaxonomyNode,
} from "@/domains/enrichment/application/catalog";
import {
  channelFromMirrorTags,
  isChannelMirrorTag,
  withoutChannelMirrorTags,
} from "@/domains/enrichment/domain/channelTags";
import { toSlug } from "@/domains/enrichment/domain/slug";
import { getDb } from "@/shared/db";
import {
  taxonomyNodes,
  transactionEnrichment,
  transactionLabels,
  transactions,
} from "@/shared/db/schema";

type TreeRef = {
  section: string;
  category: string;
  type: string;
};

type CategoryRule = {
  categoryDetailed: string;
  categoryPrimary?: string;
  tags?: string[];
  tree?: TreeRef;
  patterns: RegExp[];
};

/**
 * Ordered merchant → category rules. First match wins.
 * Keep specific patterns (Uber Eats, Esso 7-Eleven) before broad ones.
 */
const CATEGORY_RULES: CategoryRule[] = [
  // --- Card payments (before insurance / transfer) ---
  {
    categoryDetailed: "Credit Card Payment",
    categoryPrimary: "TRANSFER",
    tree: {
      section: "Transfers",
      category: "Bank Fees",
      type: "Credit Card Payment",
    },
    patterns: [
      /payment\s*thank\s*you/i,
      /paiement\s*merci/i,
      /pad\s+payment.{0,40}card/i,
      /internet\s+bill\s*pay.{0,40}card/i,
      /cibc\s+card\s+payment/i,
    ],
  },

  // --- Food delivery (before plain Uber) ---
  {
    categoryDetailed: "Restaurants",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Food and Drink",
      type: "Delivery",
    },
    patterns: [/uber\s*eats/i, /ubereats/i, /uber\s*canada\s*\/\s*ubereats/i],
  },
  {
    categoryDetailed: "Restaurants",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Food and Drink",
      type: "Restaurants",
    },
    patterns: [
      /tutti\s*frutti/i,
      /more\s*subs/i,
      /dairy\s*queen/i,
      /\bdq\b.*#/i,
    ],
  },
  {
    categoryDetailed: "Fast Food",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Food and Drink",
      type: "Restaurants",
    },
    patterns: [/mcdonald/i, /wendy/i, /burger\s*king/i, /a&w/i, /tim\s*horton/i],
  },

  // --- Rideshare (Uber Holdings / Uber Trips, not Eats) ---
  {
    categoryDetailed: "Rideshare",
    categoryPrimary: "TRANSPORTATION",
    tags: ["Online"],
    tree: {
      section: "Transport",
      category: "Rideshare and Transit",
      type: "Rideshare",
    },
    patterns: [
      /uber\s*holdings/i,
      /\buber\b(?!.*eats)/i,
      /lyft/i,
      /taxi/i,
    ],
  },

  // --- Fuel before plain 7-Eleven ---
  {
    categoryDetailed: "Gas Stations",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Fuel",
      type: "Gas Stations",
    },
    patterns: [
      /\besso\b/i,
      /\bshell\b/i,
      /\bpetro[-\s]?canada\b/i,
      /\bpioneer\b/i,
      /\bultramar\b/i,
      /gas\s*station/i,
    ],
  },
  {
    categoryDetailed: "Convenience Store",
    categoryPrimary: "GENERAL_MERCHANDISE",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Convenience Store",
    },
    patterns: [/7[-\s]?eleven/i, /seven\s*eleven/i, /circle\s*k/i, /mac'?s\b/i],
  },

  // --- AI / SaaS / Dev (before generic retail) ---
  {
    categoryDetailed: "SaaS",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Lifestyle",
      category: "Software and Subscriptions",
      type: "SaaS",
    },
    patterns: [
      /openai/i,
      /chatgpt/i,
      /anthropic/i,
      /\bclaude\b/i,
      /midjourney/i,
      /perplexity/i,
      /copilot/i,
      /\bcursor\b/i,
      /windsurf/i,
      /gemini\s*advanced/i,
      /huggingface/i,
      /replicate\.com/i,
      /\bt3\s*chat\b/i,
      /t3chat/i,
      /wealthsimple\s*tax/i,
    ],
  },
  {
    categoryDetailed: "Developer Tools",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Web Development", "Developer Tools", "Online"],
    tree: {
      section: "Lifestyle",
      category: "Software and Subscriptions",
      type: "Developer Tools",
    },
    patterns: [
      /vercel/i,
      /netlify/i,
      /github/i,
      /gitlab/i,
      /cloudflare/i,
      /supabase/i,
      /heroku/i,
      /digitalocean/i,
      /render\.com/i,
      /railway\.app/i,
      /name[-\s]?cheap/i,
      /godaddy/i,
      /hover\.com/i,
      /name\.com/i,
      /jetbrain/i,
      /docker/i,
      /colyseus/i,
    ],
  },
  {
    categoryDetailed: "SaaS",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Lifestyle",
      category: "Software and Subscriptions",
      type: "SaaS",
    },
    patterns: [
      /lemonsqueezy/i,
      /lemon.?squeezy/i,
      /lemsgzy/i,
      /figma/i,
      /notion/i,
      /slack/i,
      /zoom\.us/i,
      /zoom\.com/i,
      /adobe/i,
      /canva/i,
      /linear\.app/i,
      /atlassian/i,
      /\bjira\b/i,
      /confluence/i,
      /dropbox/i,
      /1password/i,
      /lastpass/i,
      /todoist/i,
      /asana/i,
      /monday\.com/i,
      /airtable/i,
      /intercom/i,
      /twilio/i,
      /mailchimp/i,
      /convertkit/i,
      /beehiiv/i,
      /substack/i,
      /\bpolar\b/i,
      /google\s*\*?\s*google\s*one/i,
      /google\s*one/i,
      /discord/i,
      /nitro/i,
      /x\s*corp/i,
      /twitter/i,
    ],
  },
  {
    categoryDetailed: "Streaming Services",
    categoryPrimary: "ENTERTAINMENT",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Streaming Services",
    },
    patterns: [
      /netflix/i,
      /spotify/i,
      /disney\+/i,
      /disney\s*plus/i,
      /amazon\s*prime\s*video/i,
      /apple\.com\/bill/i,
      /crave/i,
      /youtube\s*premium/i,
    ],
  },

  // --- Telecom / health / personal ---
  {
    categoryDetailed: "Mobile Phone",
    categoryPrimary: "RENT_AND_UTILITIES",
    tags: ["Online", "Subscription"],
    tree: {
      section: "Home",
      category: "Utilities",
      type: "Mobile Phone",
    },
    patterns: [/\bfizz\b/i, /freedom\s*mobile/i, /rogers/i, /bell\s*mobility/i, /telus/i, /koodo/i],
  },
  {
    categoryDetailed: "Pharmacies",
    categoryPrimary: "MEDICAL",
    tags: ["Online"],
    tree: {
      section: "Health",
      category: "Medical",
      type: "Pharmacies",
    },
    patterns: [/pocket\s*pills/i, /pharmacy/i, /shoppers\s*drug/i, /rexall/i],
  },
  {
    categoryDetailed: "Hair Salons and Barbers",
    categoryPrimary: "PERSONAL_CARE",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Hair Salons and Barbers",
    },
    patterns: [/barber/i, /salon/i, /natan\s*barber/i],
  },
  {
    categoryDetailed: "Gyms",
    categoryPrimary: "ENTERTAINMENT",
    tags: ["Subscription"],
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Gyms",
    },
    patterns: [
      /movati/i,
      /goodlife/i,
      /anytime\s*fitness/i,
      /planet\s*fitness/i,
    ],
  },
  {
    categoryDetailed: "Sports",
    categoryPrimary: "ENTERTAINMENT",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Sports",
    },
    patterns: [/driving\s*range/i, /golf/i, /fitness/i, /gym\b/i],
  },
  {
    categoryDetailed: "Insurance",
    categoryPrimary: "LOAN_PAYMENTS",
    tags: ["Subscription"],
    tree: {
      section: "Finance",
      category: "Insurance",
      type: "Payment Protection",
    },
    patterns: [
      /payment\s*protection\s*insurance/i,
      /payment\s*protector/i,
      /security\s*national/i,
      /creditor\s*insurance/i,
      /\binsurance\b/i,
    ],
  },
  {
    categoryDetailed: "Online Retail",
    categoryPrimary: "GENERAL_MERCHANDISE",
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Online Marketplaces",
    },
    patterns: [/amzn\s*mktp/i, /amazon\.ca/i, /amazon\.com/i, /\bamzn\b/i],
  },
];

function merchantBlob(txn: {
  name: string;
  merchantName: string | null;
  originalDescription: string | null;
}) {
  return [txn.merchantName, txn.name, txn.originalDescription]
    .filter(Boolean)
    .join(" ");
}

function matchRule(blob: string) {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(blob))) return rule;
  }
  return null;
}

async function ensureNamedNode(params: {
  facet: string;
  name: string;
  parentSlug?: string | null;
}) {
  return upsertTaxonomyNode({
    facet: params.facet,
    slug: toSlug(params.name),
    name: params.name,
    parentSlug: params.parentSlug ? toSlug(params.parentSlug) : null,
    source: "seed",
  });
}

/** Drop Online / In Store tag labels — Channel owns that fact. */
async function purgeChannelMirrorTagLabels() {
  const db = getDb();
  const mirrorNodes = await db
    .select({ id: taxonomyNodes.id, name: taxonomyNodes.name })
    .from(taxonomyNodes)
    .where(eq(taxonomyNodes.facet, "tag"));

  const mirrorIds = mirrorNodes
    .filter((node) => isChannelMirrorTag(node.name))
    .map((node) => node.id);

  if (mirrorIds.length === 0) return;

  await db
    .delete(transactionLabels)
    .where(
      and(
        eq(transactionLabels.role, "tag"),
        inArray(transactionLabels.nodeId, mirrorIds),
      ),
    );
}

export type ApplySpendDimensionsResult = {
  matched: number;
  categoryUpdated: number;
  tagsApplied: number;
  enrichmentUpdated: number;
};

/**
 * Double-check pass: remap mislabeled merchants onto canonical categories,
 * attach dimension tags, and align enrichment section/category/type.
 */
export async function applySpendDimensions(): Promise<ApplySpendDimensionsResult> {
  await ensureSeedTaxonomy();
  const db = getDb();

  // Extra types used by rules but not always in original seed.
  await ensureNamedNode({
    facet: "type",
    name: "Rideshare",
    parentSlug: "rideshare-and-transit",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Convenience Store",
    parentSlug: "shopping",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Streaming Services",
    parentSlug: "entertainment",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Mobile Phone",
    parentSlug: "utilities",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Pharmacies",
    parentSlug: "medical",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Sports",
    parentSlug: "entertainment",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Gyms",
    parentSlug: "entertainment",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Credit Card Payment",
    parentSlug: "bank-fees",
  });
  await ensureNamedNode({
    facet: "type",
    name: "Delivery",
    parentSlug: "food-and-drink",
  });

  const tagIds = new Map<string, number>();
  for (const name of [
    "AI",
    "Web Development",
    "Developer Tools",
    "Subscription",
  ]) {
    tagIds.set(
      name,
      await ensureNamedNode({ facet: "tag", name }),
    );
  }

  await purgeChannelMirrorTagLabels();

  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantName: transactions.merchantName,
      originalDescription: transactions.originalDescription,
      categoryDetailed: transactions.categoryDetailed,
      categoryPrimary: transactions.categoryPrimary,
    })
    .from(transactions);

  let categoryUpdated = 0;
  let tagsApplied = 0;
  let enrichmentUpdated = 0;
  let matched = 0;

  for (const row of rows) {
    const blob = merchantBlob(row);
    const rule = matchRule(blob);
    if (!rule) continue;
    matched += 1;

    const nextDetailed = rule.categoryDetailed;
    const nextPrimary = rule.categoryPrimary ?? row.categoryPrimary;

    if (
      row.categoryDetailed !== nextDetailed ||
      (nextPrimary && row.categoryPrimary !== nextPrimary)
    ) {
      await db
        .update(transactions)
        .set({
          categoryDetailed: nextDetailed,
          categoryPrimary: nextPrimary,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, row.id));
      categoryUpdated += 1;
    }

    let sectionNodeId: number | null = null;
    let categoryNodeId: number | null = null;
    let typeNodeId: number | null = null;

    if (rule.tree) {
      sectionNodeId = await ensureNamedNode({
        facet: "section",
        name: rule.tree.section,
      });
      categoryNodeId = await ensureNamedNode({
        facet: "category",
        name: rule.tree.category,
        parentSlug: rule.tree.section,
      });
      typeNodeId = await ensureNamedNode({
        facet: "type",
        name: rule.tree.type,
        parentSlug: rule.tree.category,
      });
    }

    const existingEnrichment = await db
      .select({ id: transactionEnrichment.id })
      .from(transactionEnrichment)
      .where(eq(transactionEnrichment.transactionId, row.id))
      .limit(1);

    if (sectionNodeId && categoryNodeId && typeNodeId) {
      const enrichmentPatch = {
        sectionNodeId,
        categoryNodeId,
        typeNodeId,
        channel: channelFromMirrorTags(rule.tags ?? []),
        txnKind: rule.tags?.includes("Subscription")
          ? ("subscription" as const)
          : undefined,
        enrichmentStatus: "done" as const,
        enrichmentConfidence: "HIGH" as const,
        enrichmentModel: "rules/category-audit",
        enrichedAt: new Date(),
        updatedAt: new Date(),
        error: null,
        merchantRaw: row.merchantName || row.name,
        merchantClean: row.merchantName || row.name,
      };

      if (existingEnrichment[0]) {
        await db
          .update(transactionEnrichment)
          .set(enrichmentPatch)
          .where(eq(transactionEnrichment.transactionId, row.id));
      } else {
        await db.insert(transactionEnrichment).values({
          transactionId: row.id,
          ...enrichmentPatch,
        });
      }
      enrichmentUpdated += 1;

      await db
        .delete(transactionLabels)
        .where(
          and(
            eq(transactionLabels.transactionId, row.id),
            inArray(transactionLabels.role, ["section", "category", "type"]),
          ),
        );

      await db.insert(transactionLabels).values([
        {
          transactionId: row.id,
          nodeId: sectionNodeId,
          role: "section",
          source: "rules",
          confidence: "HIGH",
        },
        {
          transactionId: row.id,
          nodeId: categoryNodeId,
          role: "category",
          source: "rules",
          confidence: "HIGH",
        },
        {
          transactionId: row.id,
          nodeId: typeNodeId,
          role: "type",
          source: "rules",
          confidence: "HIGH",
        },
      ]);
    }

    const desiredTagIds = withoutChannelMirrorTags(rule.tags ?? [])
      .map((tag) => tagIds.get(tag))
      .filter((id): id is number => Boolean(id));

    if (desiredTagIds.length === 0) continue;

    const existingTagLabels = await db
      .select({ nodeId: transactionLabels.nodeId })
      .from(transactionLabels)
      .where(
        and(
          eq(transactionLabels.transactionId, row.id),
          eq(transactionLabels.role, "tag"),
        ),
      );

    const existing = new Set(existingTagLabels.map((label) => label.nodeId));
    const toInsert = desiredTagIds.filter((id) => !existing.has(id));
    if (toInsert.length > 0) {
      await db.insert(transactionLabels).values(
        toInsert.map((nodeId) => ({
          transactionId: row.id,
          nodeId,
          role: "tag",
          source: "rules",
          confidence: "HIGH",
        })),
      );
      tagsApplied += toInsert.length;
    }
  }

  // Quiet unused — soft remaps reserved for later passes
  return { matched, categoryUpdated, tagsApplied, enrichmentUpdated };
}
