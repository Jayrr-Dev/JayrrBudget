import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import type { z } from "zod";
import { errorMessage, isRetryableAiError } from "@/shared/ai/errors";

const DEFAULT_MODELS = [
  "google/gemini-3.8-flash",
  "google/gemini-3.7-flash",
  "google/gemini-3.5-flash-lite",
  "google/gemini-2.5-flash",
] as const;

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Add it to .env.local.");
  }

  return createOpenRouter({
    apiKey,
    compatibility: "strict",
  });
}

/** Ordered model chain: env list first, then built-in Gemini flash fallbacks. */
export function getModelChain() {
  const fromList = process.env.OPENROUTER_MODELS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (fromList && fromList.length > 0) {
    return [...new Set(fromList)];
  }

  const primary = process.env.OPENROUTER_MODEL?.trim();
  const fallbacks = process.env.OPENROUTER_FALLBACK_MODELS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const chain = [
    primary,
    ...(fallbacks ?? []),
    ...DEFAULT_MODELS,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(chain)];
}

/** @deprecated Use getModelChain. */
export const getParseModelChain = getModelChain;

type OpenRouterObjectSettings = {
  plugins: Array<{ id: "response-healing" }>;
  provider: {
    allow_fallbacks: boolean;
    require_parameters: boolean;
  };
  models?: string[];
};

function objectModel(modelId: string, fallbacks: string[]) {
  const settings: OpenRouterObjectSettings = {
    plugins: [{ id: "response-healing" }],
    provider: {
      allow_fallbacks: true,
      require_parameters: true,
    },
  };
  if (fallbacks.length > 0) {
    settings.models = fallbacks;
  }
  return getOpenRouter()(modelId, settings);
}

export function chatModel(modelId: string, fallbacks: string[]) {
  const settings: {
    provider: { allow_fallbacks: boolean; require_parameters: boolean };
    models?: string[];
  } = {
    provider: {
      allow_fallbacks: true,
      require_parameters: true,
    },
  };
  if (fallbacks.length > 0) {
    settings.models = fallbacks;
  }
  return getOpenRouter()(modelId, settings);
}

const GENERATE_TIMEOUT_MS = 120_000;

async function withTimeout<T>(
  label: string,
  modelId: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs = GENERATE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const beat = setInterval(() => {
    console.info(`[${label}] waiting on ${modelId}…`);
  }, 15_000);
  try {
    return await fn(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `${label} timed out after ${timeoutMs}ms on ${modelId}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    clearInterval(beat);
  }
}

/**
 * Structured generate with model-chain fallback.
 * OpenRouter also retries providers and heals malformed JSON.
 */
export async function generateObjectWithFallback<SCHEMA extends z.ZodType>(params: {
  schema: SCHEMA;
  prompt: string;
  logLabel: string;
  temperature?: number;
  timeoutMs?: number;
  maxModelAttempts?: number;
}): Promise<{ object: z.infer<SCHEMA>; modelId: string }> {
  const models = getModelChain().slice(0, params.maxModelAttempts);
  let lastError: unknown;

  for (const [index, modelId] of models.entries()) {
    try {
      const started = Date.now();
      const { object } = await withTimeout(
        params.logLabel,
        modelId,
        (abortSignal) =>
          generateObject({
            model: objectModel(modelId, models.slice(index + 1)),
            schema: params.schema,
            temperature: params.temperature ?? 0,
            maxRetries: 0,
            prompt: params.prompt,
            abortSignal,
          }),
        params.timeoutMs,
      );
      console.info(
        `[${params.logLabel}] model=${modelId} ok in ${Date.now() - started}ms`,
      );
      return { object: object as z.infer<SCHEMA>, modelId };
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);
      console.warn(
        `[${params.logLabel}] model=${modelId} failed: ${message.slice(0, 180)}`,
      );
      if (!isRetryableAiError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `${params.logLabel} failed across all fallback models (${models.join(", ")})`,
      );
}

/** Bounded parallel map. Order of results matches input order. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}
