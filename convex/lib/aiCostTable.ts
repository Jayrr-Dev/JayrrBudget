/**
 * Reference rates for models this app uses.
 * OpenRouter token rates from https://openrouter.ai/api/v1/models (USD per token).
 * Mistral OCR from https://mistral.ai/pricing (USD per 1,000 pages).
 * Estimates only — routed provider may differ slightly.
 */

export type TokenPriceRow = {
  id: string;
  label: string;
  provider: "openrouter";
  unit: "tokens";
  /** USD per 1M input tokens */
  inputPerMillionUsd: number;
  /** USD per 1M output tokens */
  outputPerMillionUsd: number;
  sourceUrl: string;
  asOf: string;
};

export type PagePriceRow = {
  id: string;
  label: string;
  provider: "mistral";
  unit: "pages";
  /** USD per OCR page (standard, not annotated) */
  perPageUsd: number;
  sourceUrl: string;
  asOf: string;
};

export type AiPriceRow = TokenPriceRow | PagePriceRow;

/** OpenRouter prompt/completion fields are USD per token. */
function perMillionFromPerToken(perToken: number) {
  return perToken * 1_000_000;
}

export const AI_COST_TABLE: readonly AiPriceRow[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "openrouter",
    unit: "tokens",
    // OpenRouter API 2026-09-16: prompt 8.708e-8, completion 1.7416e-7
    inputPerMillionUsd: perMillionFromPerToken(0.00000008708),
    outputPerMillionUsd: perMillionFromPerToken(0.00000017416),
    sourceUrl: "https://openrouter.ai/deepseek/deepseek-v4-flash",
    asOf: "2026-09-16",
  },
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    provider: "openrouter",
    unit: "tokens",
    // OpenRouter API 2026-09-16: prompt 9e-8, completion 3e-7
    inputPerMillionUsd: perMillionFromPerToken(0.00000009),
    outputPerMillionUsd: perMillionFromPerToken(0.0000003),
    sourceUrl: "https://openrouter.ai/z-ai/glm-5.3-flash",
    asOf: "2026-09-16",
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    provider: "openrouter",
    unit: "tokens",
    // OpenRouter API 2026-09-16: prompt 3.7e-8, completion 1.7e-7
    inputPerMillionUsd: perMillionFromPerToken(0.000000037),
    outputPerMillionUsd: perMillionFromPerToken(0.00000017),
    sourceUrl: "https://openrouter.ai/openai/gpt-oss-120b",
    asOf: "2026-09-16",
  },
  {
    id: "mistral-ocr-latest",
    label: "Mistral OCR",
    provider: "mistral",
    unit: "pages",
    // Mistral API pricing: $4 / 1,000 pages (OCR 4.1 standard)
    perPageUsd: 4 / 1000,
    sourceUrl: "https://mistral.ai/pricing#api-pricing",
    asOf: "2026-09-16",
  },
] as const;

const BY_ID = new Map(AI_COST_TABLE.map((row) => [row.id, row]));

export function findAiPriceRow(modelId: string | null | undefined) {
  if (!modelId) return null;
  const direct = BY_ID.get(modelId);
  if (direct) return direct;
  for (const row of AI_COST_TABLE) {
    if (modelId === row.id || modelId.startsWith(`${row.id}`)) return row;
    if (row.id.includes(modelId) || modelId.includes(row.id)) return row;
  }
  if (modelId.includes("mistral-ocr") || modelId === "mistral-ocr-latest") {
    return BY_ID.get("mistral-ocr-latest") ?? null;
  }
  return null;
}

export function estimateTokenCostUsd(input: {
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}): number | null {
  const row = findAiPriceRow(input.modelId);
  if (!row || row.unit !== "tokens") return null;
  const inTok = input.inputTokens ?? 0;
  const outTok = input.outputTokens ?? 0;
  if (inTok <= 0 && outTok <= 0) return null;
  return (
    (inTok / 1_000_000) * row.inputPerMillionUsd +
    (outTok / 1_000_000) * row.outputPerMillionUsd
  );
}

export function estimatePageCostUsd(input: {
  modelId?: string | null;
  pages: number;
}): number | null {
  if (input.pages <= 0) return null;
  const row =
    findAiPriceRow(input.modelId ?? "mistral-ocr-latest") ??
    BY_ID.get("mistral-ocr-latest");
  if (!row || row.unit !== "pages") return null;
  return input.pages * row.perPageUsd;
}

export function estimateAiUsageUsd(input: {
  modelId: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  pages?: number | null;
}): number | null {
  if (input.pages != null && input.pages > 0) {
    return estimatePageCostUsd({
      modelId: input.modelId,
      pages: input.pages,
    });
  }
  return estimateTokenCostUsd({
    modelId: input.modelId,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
  });
}

export function formatUsd(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  if (amount === 0) return "$0";
  if (amount < 0.0001) return `$${amount.toExponential(2)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(4)}`;
}

export function formatRatePerMillion(amount: number) {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(3)}`;
}

/** UTC calendar month for billing windows, e.g. 2026-09. */
export function utcMonthKey(atMs: number) {
  const d = new Date(atMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
