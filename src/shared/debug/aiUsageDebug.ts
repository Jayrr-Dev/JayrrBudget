/** In-memory ring log for AI token usage (admin debugger). */

export type AiUsageDebugEvent = {
  id: number;
  at: number;
  source: string;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  ms: number | null;
  detail?: string;
};

const MAX_EVENTS = 200;

let seq = 0;
const events: AiUsageDebugEvent[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function logAiUsageDebug(
  input: Omit<AiUsageDebugEvent, "id" | "at">,
) {
  seq += 1;
  events.unshift({
    id: seq,
    at: Date.now(),
    ...input,
  });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  notify();
}

export function getAiUsageDebugEvents(): readonly AiUsageDebugEvent[] {
  return events;
}

export function clearAiUsageDebugEvents() {
  events.length = 0;
  notify();
}

export function subscribeAiUsageDebug(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type UsageLike = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

/** Pull usage off assistant message metadata from the chat stream. */
export function logAiUsageFromMessageMetadata(
  source: string,
  metadata: unknown,
) {
  if (!metadata || typeof metadata !== "object") return;
  const row = metadata as {
    modelId?: unknown;
    ms?: unknown;
    usage?: UsageLike;
  };
  const usage = row.usage;
  if (!usage || typeof usage !== "object") return;
  const inputTokens =
    typeof usage.inputTokens === "number" ? usage.inputTokens : null;
  const outputTokens =
    typeof usage.outputTokens === "number" ? usage.outputTokens : null;
  const totalTokens =
    typeof usage.totalTokens === "number"
      ? usage.totalTokens
      : inputTokens != null || outputTokens != null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null;
  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return;
  }
  logAiUsageDebug({
    source,
    modelId: typeof row.modelId === "string" ? row.modelId : null,
    inputTokens,
    outputTokens,
    totalTokens,
    ms: typeof row.ms === "number" ? row.ms : null,
  });
}
