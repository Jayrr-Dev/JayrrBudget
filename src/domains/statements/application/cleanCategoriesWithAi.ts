import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { generateObjectWithFallback } from "@/shared/ai/openRouter";
import {
  ensureSeedTaxonomy,
  upsertTaxonomyNode,
} from "@/domains/enrichment/application/catalog";
import { withoutChannelMirrorTags } from "@/domains/enrichment/domain/channelTags";
import { SEED_TAXONOMY } from "@/domains/enrichment/domain/seedTaxonomy";
import { toSlug } from "@/domains/enrichment/domain/slug";
import {
  loadCategoryVocabulary,
  resolveAgainstVocabulary,
  type CategoryVocabulary,
} from "@/domains/statements/application/categoryVocabulary";
import { getDb } from "@/shared/db";
import {
  taxonomyNodes,
  transactionLabels,
  transactions,
} from "@/shared/db/schema";

const cleanBatchSchema = z.object({
  items: z
    .array(
      z.object({
        transactionId: z.number().int().positive(),
        categoryDetailed: z
          .string()
          .min(1)
          .describe("Canonical fine category. Prefer EXISTING labels list."),
        categoryPrimary: z
          .string()
          .nullable()
          .describe(
            "Broad bucket e.g. FOOD_AND_DRINK, TRANSPORTATION, GENERAL_SERVICES",
          ),
        tags: z
          .array(z.string())
          .default([])
          .describe(
            "Dimension tags from allowed list only (AI, Web Development, Subscription, Fee, …). Never Online or In Store — those belong on paymentChannel.",
          ),
        fix: z
          .boolean()
          .default(false)
          .describe("true if current category/tags were wrong and you corrected them"),
      }),
    )
    .describe("Exactly one item per input transactionId"),
});

export type CategoryCleanResult = {
  batches: number;
  reviewed: number;
  updated: number;
  tagsApplied: number;
};

const BATCH_SIZE = 20;

const ALLOWED_TAGS = [
  "AI",
  "Web Development",
  "Developer Tools",
  "Subscription",
  "Fee",
  "Statement",
] as const;

function preferredDetailedLabels(vocabulary: CategoryVocabulary) {
  const seed = SEED_TAXONOMY.filter(
    (node) => node.facet === "type" || node.facet === "category",
  ).map((node) => node.name);
  return [...new Set([...seed, ...vocabulary.categoryDetailed])].sort((a, b) =>
    a.localeCompare(b),
  );
}

function buildCleanPrompt(params: {
  batch: Array<{
    id: number;
    name: string;
    merchantName: string | null;
    originalDescription: string | null;
    amount: number;
    date: string;
    paymentChannel: string | null;
    transactionCode: string | null;
    categoryPrimary: string | null;
    categoryDetailed: string | null;
    tags: string[];
  }>;
  vocabulary: CategoryVocabulary;
  preferredDetailed: string[];
}) {
  const txnLines = params.batch.map((txn) =>
    JSON.stringify({
      transactionId: txn.id,
      date: txn.date,
      amount: txn.amount,
      merchantName: txn.merchantName,
      name: txn.name,
      originalDescription: txn.originalDescription,
      paymentChannel: txn.paymentChannel,
      transactionCode: txn.transactionCode,
      currentCategoryPrimary: txn.categoryPrimary,
      currentCategoryDetailed: txn.categoryDetailed,
      currentTags: txn.tags,
    }),
  );

  return [
    "You are the category QA pass for a Canadian personal budget ledger.",
    "Review EVERY transaction. Fix wrong categoryDetailed / categoryPrimary / tags.",
    "Return exactly one item per transactionId.",
    "Set fix=true only when you change something.",
    "",
    "HARD RULES:",
    '- Uber Eats / UBEREATS => Restaurants (food delivery). Channel online — do not tag Online',
    '- Uber Holdings / Uber trip (no Eats) => Rideshare. Channel online — do not tag Online',
    '- ESSO / Shell / Petro-Canada (+ optional 7-Eleven) => Gas Stations',
    '- Plain 7-Eleven store (no fuel brand) => Convenience Store',
    '- OpenAI, ChatGPT, Cursor, Windsurf, Anthropic => SaaS + tags AI, Subscription',
    '- Vercel, GitHub, Cloudflare, Namecheap, Colyseus => Developer Tools + Web Development',
    '- Canva, Discord Nitro, Google One, Polar, X Corp, Lemon Squeezy => SaaS + Subscription',
    '- Netflix / Spotify => Streaming Services + Subscription',
    '- FIZZ / mobile carriers => Mobile Phone',
    '- PocketPills / pharmacy => Pharmacies',
    '- Barber / salon => Hair Salons and Barbers',
    '- Payment Thank You / Paiement Merci / PAD to a CIBC card => Credit Card Payment',
    '- Movati / GoodLife / gym membership => Gyms (not Personal Care)',
    '- T3 Chat / Wealthsimple Tax => SaaS',
    '- Amazon marketplace => Online Retail — NOT SaaS',
    '- Never tag Online or In Store — paymentChannel already carries that',
    '- Never use junk buckets: Transportation, Retail and Grocery, Foreign Currency Transactions, Personal and Household Expenses, Professional and Financial Services, Digital Content, Software and Subscriptions (use SaaS instead), Health and Education',
    "- Prefer an EXISTING preferred label over inventing a near-duplicate.",
    "- Amount convention: positive = money out (purchase/fee).",
    "",
    "PREFERRED categoryDetailed labels (reuse exact spelling when match):",
    ...params.preferredDetailed.slice(0, 200).map((label) => `- ${label}`),
    "",
    "EXISTING categoryPrimary values:",
    ...params.vocabulary.categoryPrimary
      .slice(0, 60)
      .map((label) => `- ${label}`),
    "",
    "ALLOWED tags only:",
    ...ALLOWED_TAGS.map((tag) => `- ${tag}`),
    "",
    "TRANSACTIONS TO REVIEW:",
    ...txnLines,
  ].join("\n");
}

async function generateCleanBatch(prompt: string) {
  const { object } = await generateObjectWithFallback({
    schema: cleanBatchSchema,
    logLabel: "category-clean",
    prompt,
  });
  return object.items;
}

async function loadTagNamesByTxn(txnIds: number[]) {
  if (txnIds.length === 0) return new Map<number, string[]>();
  const db = getDb();
  const rows = await db
    .select({
      transactionId: transactionLabels.transactionId,
      tagName: taxonomyNodes.name,
    })
    .from(transactionLabels)
    .innerJoin(taxonomyNodes, eq(taxonomyNodes.id, transactionLabels.nodeId))
    .where(
      and(
        inArray(transactionLabels.transactionId, txnIds),
        eq(transactionLabels.role, "tag"),
      ),
    );

  const map = new Map<number, string[]>();
  for (const row of rows) {
    if (!row.tagName) continue;
    const list = map.get(row.transactionId) ?? [];
    if (!list.includes(row.tagName)) list.push(row.tagName);
    map.set(row.transactionId, list);
  }
  return map;
}

async function replaceTxnTags(transactionId: number, tags: string[]) {
  const db = getDb();
  const allowed = new Set(ALLOWED_TAGS.map((tag) => tag.toLowerCase()));
  const cleaned = [
    ...new Set(
      withoutChannelMirrorTags(
        tags
          .map((tag) => tag.trim())
          .filter((tag) => allowed.has(tag.toLowerCase())),
      ),
    ),
  ];

  // Canonical casing from allow-list
  const canonical = cleaned.map((tag) => {
    const hit = ALLOWED_TAGS.find(
      (allowedTag) => allowedTag.toLowerCase() === tag.toLowerCase(),
    );
    return hit ?? tag;
  });

  await db
    .delete(transactionLabels)
    .where(
      and(
        eq(transactionLabels.transactionId, transactionId),
        eq(transactionLabels.role, "tag"),
      ),
    );

  if (canonical.length === 0) return 0;

  let applied = 0;
  for (const tag of canonical) {
    const nodeId = await upsertTaxonomyNode({
      facet: "tag",
      slug: toSlug(tag),
      name: tag,
      source: "ai",
    });
    await db.insert(transactionLabels).values({
      transactionId,
      nodeId,
      role: "tag",
      source: "ai-clean",
      confidence: "HIGH",
    });
    applied += 1;
  }
  return applied;
}

/**
 * Always-on AI cleaning pass: re-check categories/tags with full vocabulary context.
 */
export async function cleanCategoriesWithAi(options?: {
  transactionIds?: number[];
}): Promise<CategoryCleanResult> {
  await ensureSeedTaxonomy();
  const db = getDb();
  const vocabulary = await loadCategoryVocabulary();
  const preferredDetailed = preferredDetailedLabels(vocabulary);

  const rows = options?.transactionIds?.length
    ? await db
        .select({
          id: transactions.id,
          name: transactions.name,
          merchantName: transactions.merchantName,
          originalDescription: transactions.originalDescription,
          amount: transactions.amount,
          date: transactions.date,
          paymentChannel: transactions.paymentChannel,
          transactionCode: transactions.transactionCode,
          categoryPrimary: transactions.categoryPrimary,
          categoryDetailed: transactions.categoryDetailed,
        })
        .from(transactions)
        .where(inArray(transactions.id, options.transactionIds))
    : await db
        .select({
          id: transactions.id,
          name: transactions.name,
          merchantName: transactions.merchantName,
          originalDescription: transactions.originalDescription,
          amount: transactions.amount,
          date: transactions.date,
          paymentChannel: transactions.paymentChannel,
          transactionCode: transactions.transactionCode,
          categoryPrimary: transactions.categoryPrimary,
          categoryDetailed: transactions.categoryDetailed,
        })
        .from(transactions);

  if (rows.length === 0) {
    return { batches: 0, reviewed: 0, updated: 0, tagsApplied: 0 };
  }

  const tagsByTxn = await loadTagNamesByTxn(rows.map((row) => row.id));
  let batches = 0;
  let updated = 0;
  let tagsApplied = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const batch = slice.map((row) => ({
      ...row,
      tags: tagsByTxn.get(row.id) ?? [],
    }));

    const prompt = buildCleanPrompt({
      batch,
      vocabulary,
      preferredDetailed,
    });
    const items = await generateCleanBatch(prompt);
    batches += 1;

    const byId = new Map(items.map((item) => [item.transactionId, item]));

    for (const row of slice) {
      const item = byId.get(row.id);
      if (!item) continue;

      const detailed =
        resolveAgainstVocabulary(item.categoryDetailed, preferredDetailed) ??
        item.categoryDetailed.trim();
      const primary =
        resolveAgainstVocabulary(
          item.categoryPrimary,
          vocabulary.categoryPrimary,
        ) ?? item.categoryPrimary;

      const detailedChanged = detailed !== (row.categoryDetailed ?? "");
      const primaryChanged = (primary ?? null) !== (row.categoryPrimary ?? null);
      const nextTags = item.tags ?? [];
      const prevTags = [...(tagsByTxn.get(row.id) ?? [])].sort().join("|");
      const tagsChanged =
        [...nextTags].map((tag) => tag.trim()).filter(Boolean).sort().join("|") !==
        prevTags;

      if (!detailedChanged && !primaryChanged && !tagsChanged && !item.fix) {
        continue;
      }

      if (detailedChanged || primaryChanged) {
        await db
          .update(transactions)
          .set({
            categoryDetailed: detailed,
            categoryPrimary: primary,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, row.id));
        updated += 1;
      }

      if (tagsChanged || item.fix) {
        tagsApplied += await replaceTxnTags(row.id, nextTags);
        tagsByTxn.set(row.id, nextTags);
      }
    }
  }

  return {
    batches,
    reviewed: rows.length,
    updated,
    tagsApplied,
  };
}
