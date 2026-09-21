import "server-only";

import { api } from "@convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";
import { runWithJevKey } from "@/shared/ai/jev.server";
import { runWithModelChain, runWithOpenRouterKey } from "@/shared/ai/openRouter";
import { resolveJevApiKey } from "@/shared/ai/resolveJev.server";
import {
  emitAiUsage,
  runWithAiUsageSink,
  type AiBilledTo,
  type AiUsageSinkEvent,
} from "@/shared/ai/aiUsageSink";

export type { AiBilledTo };

function tokensFromUsage(usage: LanguageModelUsageLike | null | undefined) {
  const inputTokens =
    typeof usage?.inputTokens === "number" ? usage.inputTokens : null;
  const outputTokens =
    typeof usage?.outputTokens === "number" ? usage.outputTokens : null;
  const totalTokens =
    typeof usage?.totalTokens === "number"
      ? usage.totalTokens
      : inputTokens != null || outputTokens != null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null;
  return { inputTokens, outputTokens, totalTokens };
}

type LanguageModelUsageLike = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

export async function persistAiUsage(
  client: ConvexHttpClient,
  billedTo: AiBilledTo,
  event: AiUsageSinkEvent,
) {
  const { inputTokens, outputTokens, totalTokens } = tokensFromUsage(
    event.usage,
  );
  const pages = event.pages ?? null;
  if (
    (pages == null || pages <= 0) &&
    inputTokens == null &&
    outputTokens == null &&
    totalTokens == null
  ) {
    return;
  }
  try {
    await client.mutation(api.aiUsage.record, {
      source: event.source,
      modelId: event.modelId,
      billedTo: event.billedTo ?? billedTo,
      inputTokens,
      outputTokens,
      totalTokens,
      pages,
      ms: event.ms ?? null,
    });
  } catch (error) {
    console.error(
      "[aiUsage] record failed",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function runMeteredOpenRouter<T>(
  client: ConvexHttpClient,
  loaded: { apiKey: string; billedTo: AiBilledTo },
  fn: () => T,
): Promise<T> {
  const models = await client.query(api.service.getAiModels, {});
  const jev = await resolveJevApiKey(client);
  const run = () =>
    runWithOpenRouterKey(loaded.apiKey, () =>
      runWithModelChain(models.chain, fn),
    );
  const pending: AiUsageSinkEvent[] = [];
  const result = await runWithAiUsageSink(
    async (event) => {
      pending.push(event);
    },
    () => (jev ? runWithJevKey(jev, run) : run()),
  );
  await Promise.all(
    pending.map((event) => persistAiUsage(client, loaded.billedTo, event)),
  );
  return result;
}

export { emitAiUsage };
