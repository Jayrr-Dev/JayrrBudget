import { errorMessage, isRetryableAiError } from "@/shared/ai/errors";
import { emitAiUsage } from "@/shared/ai/aiUsageSink";
import { resolveOpenRouterModel } from "@convex/lib/openRouterModels";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { AsyncLocalStorage } from "node:async_hooks";
import type { z } from "zod";

const requestApiKey = new AsyncLocalStorage<string>();
const requestModelChain = new AsyncLocalStorage<string[]>();

export const OPENROUTER_NOT_CONFIGURED =
  "No OpenRouter key. Add yours on Profile, or set OPENROUTER_API_KEY on the server.";

export function runWithOpenRouterKey<T>(apiKey: string, fn: () => T): T {
  return requestApiKey.run(apiKey, fn);
}

export function runWithModelChain<T>(chain: string[], fn: () => T): T {
  if (chain.length === 0) return fn();
  return requestModelChain.run(chain, fn);
}

const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash",
  "z-ai/glm-5.3-flash",
  "openai/gpt-oss-120b",
] as const;

export function isOpenRouterConfigured() {
  return Boolean(requestApiKey.getStore() || process.env.OPENROUTER_API_KEY);
}

export function getOpenRouter() {
  const apiKey = requestApiKey.getStore() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(OPENROUTER_NOT_CONFIGURED);
  }

  return createOpenRouter({
    apiKey,
    compatibility: "strict",
  });
}

/** Ordered model chain: saved Service pick, then env, then built-in flash models. */
export function getModelChain() {
  const stored = requestModelChain.getStore();
  if (stored && stored.length > 0) {
    return [...new Set(stored)];
  }

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

  const chain = [primary, ...(fallbacks ?? []), ...DEFAULT_MODELS].filter(
    (value): value is string => Boolean(value),
  );

  return [...new Set(chain)];
}

/** @deprecated Use getModelChain. */
export const getParseModelChain = getModelChain;

type OpenRouterObjectSettings = {
  plugins: Array<{ id: "response-healing" }>;
  provider: {
    allow_fallbacks: boolean;
    require_parameters: boolean;
    only?: string[];
  };
  models?: string[];
};

function openRouterFallbacks(modelId: string, fallbacks: string[]) {
  const primary = resolveOpenRouterModel(modelId).openRouterId;
  return [
    ...new Set(
      fallbacks
        .map((id) => resolveOpenRouterModel(id).openRouterId)
        .filter((id) => id !== primary),
    ),
  ];
}

function objectModel(modelId: string, fallbacks: string[]) {
  const choice = resolveOpenRouterModel(modelId);
  const settings: OpenRouterObjectSettings = {
    plugins: [{ id: "response-healing" }],
    provider: {
      allow_fallbacks: true,
      require_parameters: true,
    },
  };
  if (choice.providerOnly) {
    settings.provider.only = [choice.providerOnly];
  }
  const next = openRouterFallbacks(modelId, fallbacks);
  if (next.length > 0) {
    settings.models = next;
  }
  return getOpenRouter()(choice.openRouterId, settings);
}

type ChatModelOptions = {
  /** Ask the model to think first and stream the summary back as reasoning parts. */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  /** false = one tool call per step, so the UI can show work landing piece by piece. */
  parallelToolCalls?: boolean;
};

export function chatModel(
  modelId: string,
  fallbacks: string[],
  options: ChatModelOptions = {},
) {
  const choice = resolveOpenRouterModel(modelId);
  const settings: {
    provider: {
      allow_fallbacks: boolean;
      require_parameters: boolean;
      only?: string[];
    };
    models?: string[];
    reasoning?: { effort: NonNullable<ChatModelOptions["reasoningEffort"]> };
    parallelToolCalls?: boolean;
  } = {
    // false: cheap multi-provider models often omit params like
    // parallel_tool_calls from their endpoint lists; require_parameters
    // true then returns "No endpoints found".
    provider: {
      allow_fallbacks: true,
      require_parameters: false,
    },
  };
  if (choice.providerOnly) {
    settings.provider.only = [choice.providerOnly];
  }
  const next = openRouterFallbacks(modelId, fallbacks);
  if (next.length > 0) {
    settings.models = next;
  }
  if (options.reasoningEffort) {
    settings.reasoning = { effort: options.reasoningEffort };
  }
  if (options.parallelToolCalls !== undefined) {
    settings.parallelToolCalls = options.parallelToolCalls;
  }
  return getOpenRouter()(choice.openRouterId, settings);
}

const WEB_SEARCH_MAX_RESULTS = 5;

/**
 * OpenRouter server-side web search. The model decides when to call it;
 * OpenRouter runs the search and streams `url_citation`s back as source parts.
 * Billed per search on the same key as the chat call.
 */
export function webSearchTool(maxResults = WEB_SEARCH_MAX_RESULTS) {
  return getOpenRouter().tools.webSearch({ maxResults });
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
      throw new Error(`${label} timed out after ${timeoutMs}ms on ${modelId}`);
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
export async function generateObjectWithFallback<
  SCHEMA extends z.ZodType,
>(params: {
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
      const generated = await withTimeout(
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
      const ms = Date.now() - started;
      console.info(`[${params.logLabel}] model=${modelId} ok in ${ms}ms`);
      await emitAiUsage({
        source: params.logLabel,
        modelId,
        usage: generated.usage,
        ms,
      });
      return { object: generated.object as z.infer<SCHEMA>, modelId };
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

export { mapPool } from "@/shared/lib/map-pool";
