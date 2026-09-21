import { merchantRewriteName } from "@/domains/merchants/domain/acceptMerchantRewrite";
import { MERCHANT_CLEAN_AI_RULES } from "@/domains/enrichment/domain/merchantCleanAiRules";
import { cleanMerchantDescriptor } from "@convex/lib/cleanMerchantDescriptor";
import { generateObjectWithFallback } from "@/shared/ai/openRouter";
import { z } from "zod";

const BATCH = 16;

const rewriteSchema = z.object({
  names: z
    .array(
      z.object({
        id: z.string(),
        canonicalName: z
          .string()
          .describe(
            "Short payee title. Empty string when the line has no payee.",
          ),
      }),
    )
    .describe("One row per input id."),
});

export type MerchantNameRewrite = {
  canonicalName: string;
  merchantIds: string[];
};

type NamedMerchant = {
  id: string;
  name: string;
};

/**
 * The model reads each bank line and writes the payee.
 * A title that does not belong to that line is dropped.
 * A failed batch leaves those names for the draft cleaner.
 */
export async function rewriteMerchantNames(
  listed: NamedMerchant[],
  onProgress?: (done: number, total: number) => void,
): Promise<MerchantNameRewrite[]> {
  const total = listed.length;
  onProgress?.(0, total);
  if (total === 0) return [];

  const accepted = new Map<
    string,
    { canonicalName: string; ids: Set<string> }
  >();
  let done = 0;
  for (let offset = 0; offset < listed.length; offset += BATCH) {
    const slice = listed.slice(offset, offset + BATCH);
    try {
      const rows = await askRewrite(slice);
      const byId = new Map(
        rows.map((row) => [row.id.trim(), row.canonicalName]),
      );
      for (const merchant of slice) {
        const proposed = byId.get(merchant.id);
        if (proposed == null) continue;
        const canonical = merchantRewriteName(merchant.name, proposed);
        if (canonical == null) continue;
        const key = canonical.toLowerCase();
        const existing = accepted.get(key);
        if (existing) {
          existing.ids.add(merchant.id);
          continue;
        }
        accepted.set(key, {
          canonicalName: canonical,
          ids: new Set([merchant.id]),
        });
      }
    } catch (error) {
      console.error(
        "[merchant-rewrite] batch failed",
        error instanceof Error ? error.message : error,
      );
    }
    done += slice.length;
    onProgress?.(Math.min(total, done), total);
  }

  return [...accepted.values()].map((group) => ({
    canonicalName: group.canonicalName,
    merchantIds: [...group.ids],
  }));
}

async function askRewrite(slice: NamedMerchant[]) {
  const prompt = [
    "You clean merchant names on a personal ledger.",
    "Each line is one bank or card descriptor. Write the payee only.",
    "draft is a mechanical first pass. Keep it when it is already the payee.",
    "Fix draft when a city, a bank spend label, or an amount is still in it.",
    "Do not invent a store that is not written in the line. Amzn means Amazon.",
    "If the line is only punctuation, canonicalName is an empty string.",
    "Return one names row for every id.",
    MERCHANT_CLEAN_AI_RULES,
    "",
    "LINES:",
    ...slice.map((merchant) =>
      JSON.stringify({
        id: merchant.id,
        raw: merchant.name,
        draft: cleanMerchantDescriptor(merchant.name) ?? "",
      }),
    ),
  ].join("\n");

  const { object } = await generateObjectWithFallback({
    schema: rewriteSchema,
    logLabel: "merchant-rewrite",
    prompt,
  });
  return object.names;
}
