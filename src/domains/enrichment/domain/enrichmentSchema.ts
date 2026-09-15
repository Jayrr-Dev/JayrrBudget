import { z } from "zod";

export const entityKindSchema = z.enum([
  "company",
  "subsidiary",
  "brand",
  "product",
]);

export const taxonomyFacetSchema = z.enum([
  "section",
  "category",
  "subcategory",
  "type",
  "transaction_type",
  "tag",
  "store_type",
  "food_type",
]);

export const channelSchema = z.enum(["online", "in_store", "other"]);

/** Unified line nature (was txnCode + kind). */
export const txnKindSchema = z.enum([
  "purchase",
  "payment",
  "refund",
  "fee",
  "interest",
  "cash_advance",
  "transfer",
  "subscription",
  "statement",
  "other",
]);

export const confidenceSchema = z.enum([
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNKNOWN",
]);

const namedSlugSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

const entityRefSchema = namedSlugSchema.extend({
  kind: entityKindSchema,
  parentSlug: z.string().nullable().optional(),
});

const nodeRefSchema = namedSlugSchema.extend({
  facet: taxonomyFacetSchema.optional(),
  parentSlug: z.string().nullable().optional(),
});

export const merchantEnrichmentItemSchema = z.object({
  transactionId: z.number().int().positive(),
  merchantRaw: z.string(),
  merchantClean: z.string(),
  tokens: z.array(z.string()).default([]),
  company: entityRefSchema.nullable(),
  brand: entityRefSchema.nullable(),
  subsidiary: entityRefSchema.nullable(),
  product: entityRefSchema.nullable(),
  section: nodeRefSchema.nullable(),
  category: nodeRefSchema.nullable(),
  type: nodeRefSchema.nullable(),
  storeType: nodeRefSchema.nullable(),
  foodType: nodeRefSchema.nullable(),
  tags: z.array(namedSlugSchema).default([]),
  channel: channelSchema.nullable().default("other"),
  txnKind: txnKindSchema.nullable().default("other"),
  storeNumber: z.string().nullable(),
  legalSuffix: z.string().nullable(),
  locationCity: z.string().nullable().optional(),
  locationRegion: z.string().nullable().optional(),
  locationCountry: z.string().nullable().optional(),
  confidence: confidenceSchema.default("MEDIUM"),
});

export const merchantEnrichmentBatchSchema = z.object({
  items: z.array(merchantEnrichmentItemSchema),
  newEntities: z.array(entityRefSchema).default([]),
  newNodes: z
    .array(
      nodeRefSchema.extend({
        facet: taxonomyFacetSchema,
      }),
    )
    .default([]),
});

export type MerchantEnrichmentItem = z.infer<
  typeof merchantEnrichmentItemSchema
>;
export type MerchantEnrichmentBatch = z.infer<
  typeof merchantEnrichmentBatchSchema
>;

export type EnrichmentTxnInput = {
  id: number;
  name: string;
  merchantName: string | null;
  originalDescription: string | null;
  amount: number;
  date: string;
  authorizedDate: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  sectionName: string | null;
  paymentChannel: string | null;
  transactionCode: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
};
