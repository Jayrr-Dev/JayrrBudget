import type { LanguageModelUsage } from "ai";

/** Pack token usage for UI message metadata (admin AI Usage tab). */
export function aiUsageMessageMetadata(input: {
  modelId: string;
  usage?: LanguageModelUsage | null;
  startedAt: number;
}) {
  const usage = input.usage;
  if (!usage) return undefined;
  const inputTokens = usage.inputTokens ?? null;
  const outputTokens = usage.outputTokens ?? null;
  const totalTokens =
    inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null;
  return {
    modelId: input.modelId,
    ms: Date.now() - input.startedAt,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
  };
}
