import { generateObjectWithFallback, mapPool } from "@/shared/ai/openRouter";
import {
  formatCatalogForPrompt,
  loadEnrichmentCatalog,
  type EnrichmentCatalog,
} from "@/domains/enrichment/application/catalog";
import {
  merchantEnrichmentBatchSchema,
  type EnrichmentTxnInput,
  type MerchantEnrichmentBatch,
} from "@/domains/enrichment/domain/enrichmentSchema";

function buildPrompt(
  txns: EnrichmentTxnInput[],
  catalog: EnrichmentCatalog,
) {
  const txnLines = txns.map((txn) =>
    JSON.stringify({
      transactionId: txn.id,
      name: txn.name,
      merchantName: txn.merchantName,
      originalDescription: txn.originalDescription,
      amount: txn.amount,
      date: txn.date,
      authorizedDate: txn.authorizedDate,
      categoryPrimary: txn.categoryPrimary,
      categoryDetailed: txn.categoryDetailed,
      paymentChannel: txn.paymentChannel,
      transactionCode: txn.transactionCode,
      locationCity: txn.locationCity,
      locationRegion: txn.locationRegion,
      locationCountry: txn.locationCountry,
    }),
  );

  return [
    "You enrich Canadian bank/credit-card merchant names for analytics mining.",
    "Return one item per transactionId. Reuse EXISTING entity/taxonomy slugs when they match.",
    "Only put truly new companies/nodes in newEntities/newNodes.",
    "If categoryPrimary/categoryDetailed hints match an existing taxonomy node, reuse that node.",
    "",
    "Name parsing rules:",
    '- "Uber Holdings Canada Inc." => company Uber, subsidiary Uber Holdings, legalSuffix Inc, geo Canada',
    '- "Uber Eats" / "UBER CANADA/UBEREATS" => company Uber, brand Uber Eats',
    '- "OpenAI ChatGPT Subscription" => company OpenAI (slug openai), product ChatGPT, type SaaS, tags AI + Subscription',
    '- "Lemon Squeezy" / software checkout processors => type SaaS, tag Subscription',
    '- "Vercel" / "GitHub" / "Cloudflare" => type Developer Tools, tags Web Development + Developer Tools',
    '- "Tutti Frutti Dessert Cafe" => company Tutti Frutti, foodType Dessert, storeType Cafe',
    "- Strip noise: asterisks, store numbers into storeNumber, glued cities (city goes in location fields)",
    "- Section > Category > Type is spend tree. Company/brand is separate entity graph.",
    "- Amount convention: positive = money out (purchase/fee).",
    "- Software subscriptions are SaaS under Software and Subscriptions — never Online Retail / Shopping.",
    "- Reuse EXISTING taxonomy names/slugs for near-duplicates: Gas→Gas Stations, Restaurant→Restaurants, Convenience Store↔Convenience Stores.",
    "- Dimension tags: attach AI for model/LLM tools, Web Development for hosting/domains/CI, Developer Tools for IDEs/git, Subscription when recurring.",
    "- Do not create a new type/category that is only a plural, typo, or paraphrase of an existing one.",
    "",
    formatCatalogForPrompt(catalog),
    "",
    "TRANSACTIONS:",
    ...txnLines,
  ].join("\n");
}

const BATCH_SIZE = 20;
const LLM_CONCURRENCY = 2;

export async function enrichMerchantBatchWithOpenRouter(
  txns: EnrichmentTxnInput[],
  catalog?: EnrichmentCatalog,
): Promise<{ batch: MerchantEnrichmentBatch; modelId: string }> {
  const loaded = catalog ?? (await loadEnrichmentCatalog());
  const { object, modelId } = await generateObjectWithFallback({
    schema: merchantEnrichmentBatchSchema,
    logLabel: "enrichment",
    prompt: buildPrompt(txns, loaded),
  });
  return { batch: object, modelId };
}

export async function enrichMerchantsWithOpenRouter(
  txns: EnrichmentTxnInput[],
  onBatch?: (result: {
    batch: MerchantEnrichmentBatch;
    modelId: string;
  }) => Promise<void>,
): Promise<{
  results: Array<{ batch: MerchantEnrichmentBatch; modelId: string }>;
}> {
  const catalog = await loadEnrichmentCatalog();
  const slices: EnrichmentTxnInput[][] = [];
  for (let i = 0; i < txns.length; i += BATCH_SIZE) {
    slices.push(txns.slice(i, i + BATCH_SIZE));
  }

  const results = await mapPool(slices, LLM_CONCURRENCY, async (slice) => {
    const result = await enrichMerchantBatchWithOpenRouter(slice, catalog);
    if (onBatch) await onBatch(result);
    return result;
  });

  return { results };
}
