import { AsyncLocalStorage } from "node:async_hooks";
import type { LanguageModelUsage } from "ai";

export type AiBilledTo = "platform" | "byok";

export type AiUsageSinkEvent = {
  source: string;
  modelId: string;
  billedTo?: AiBilledTo;
  usage?: LanguageModelUsage | null;
  pages?: number | null;
  ms?: number | null;
};

type AiUsageSink = (event: AiUsageSinkEvent) => Promise<void>;

const sinkStore = new AsyncLocalStorage<AiUsageSink>();

export function runWithAiUsageSink<T>(sink: AiUsageSink, fn: () => T): T {
  return sinkStore.run(sink, fn);
}

export async function emitAiUsage(event: AiUsageSinkEvent) {
  const sink = sinkStore.getStore();
  if (!sink) return;
  await sink(event);
}
