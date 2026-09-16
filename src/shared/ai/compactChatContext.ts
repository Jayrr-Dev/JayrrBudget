import "server-only";

import { persistAiUsage, type AiBilledTo } from "@/shared/ai/aiMeter.server";
import { chatModel } from "@/shared/ai/openRouter";
import { errorMessage } from "@/shared/lib/error-message";
import type { ConvexHttpClient } from "convex/browser";
import {
  generateText,
  pruneMessages,
  type ModelMessage,
} from "ai";

/** Chars / 4 ≈ tokens. Same estimator as AI SDK loop-control docs. */
export const CHAT_COMPACTION_THRESHOLD = 24_000;
const KEEP_RECENT_MESSAGES = 8;
const SUMMARIZE_INPUT_CHARS = 20_000;
const SUMMARY_MAX_CHARS = 800;

const COMPACT_SYSTEM =
  "Summarize this budget chat so a helper can continue without the full transcript. Short bullets: decisions, numbers the user cares about, open questions, canvas or ledger work in progress. No card numbers or passwords.";

export function estimateMessageTokens(messages: ModelMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

export function pruneChatMessages(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({
    messages,
    reasoning: "all",
    toolCalls: "before-last-3-messages",
    emptyMessages: "remove",
  });
}

function textFromMessage(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  const bits: string[] = [];
  for (const part of message.content) {
    if (part.type === "text") {
      bits.push(part.text);
      continue;
    }
    if (part.type === "tool-call") {
      bits.push(`[used ${part.toolName}]`);
    }
  }
  return bits.join(" ").trim();
}

function transcriptFrom(messages: ModelMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = textFromMessage(message);
    if (!text) continue;
    lines.push(`${message.role}: ${text}`);
  }
  const joined = lines.join("\n");
  if (joined.length <= SUMMARIZE_INPUT_CHARS) {
    return joined;
  }
  return joined.slice(-SUMMARIZE_INPUT_CHARS);
}

/**
 * Drop old reasoning and tool traces. If the thread is still huge,
 * replace older turns with one summary message (AI SDK compaction).
 */
export async function compactModelMessages(options: {
  messages: ModelMessage[];
  modelId: string;
  fallbacks: string[];
  client: ConvexHttpClient;
  billedTo: AiBilledTo;
  source: string;
  onSummary?: (summary: string) => Promise<void>;
}): Promise<ModelMessage[]> {
  const pruned = pruneChatMessages(options.messages);
  if (estimateMessageTokens(pruned) <= CHAT_COMPACTION_THRESHOLD) {
    return pruned;
  }
  if (pruned.length <= KEEP_RECENT_MESSAGES + 1) {
    return pruned;
  }

  const older = pruned.slice(0, -KEEP_RECENT_MESSAGES);
  const recent = pruned.slice(-KEEP_RECENT_MESSAGES);
  const transcript = transcriptFrom(older);
  if (!transcript) {
    return recent;
  }

  let summary: string;
  try {
    summary = await summarizeTranscript({
      transcript,
      modelId: options.modelId,
      fallbacks: options.fallbacks,
      client: options.client,
      billedTo: options.billedTo,
      source: options.source,
    });
  } catch (error) {
    console.warn(
      `[chat-compact] summarize failed: ${errorMessage(error)}`,
    );
    return [
      {
        role: "user",
        content:
          "Earlier turns were trimmed to save context. Continue from the recent messages.",
      },
      ...recent,
    ];
  }

  if (options.onSummary) {
    try {
      await options.onSummary(summary);
    } catch (error) {
      console.warn(
        `[chat-compact] save summary failed: ${errorMessage(error)}`,
      );
    }
  }

  return [
    {
      role: "user",
      content: `Earlier in this conversation (auto-summary):\n${summary}`,
    },
    ...recent,
  ];
}

/** prepareStep: prune tool/reasoning buildup inside a long agent loop. */
export function prepareCompactChatStep({
  messages,
}: {
  messages: ModelMessage[];
}) {
  if (estimateMessageTokens(messages) <= CHAT_COMPACTION_THRESHOLD) {
    return {};
  }
  return { messages: pruneChatMessages(messages) };
}

async function summarizeTranscript(options: {
  transcript: string;
  modelId: string;
  fallbacks: string[];
  client: ConvexHttpClient;
  billedTo: AiBilledTo;
  source: string;
}): Promise<string> {
  const startedAt = Date.now();
  const result = await generateText({
    model: chatModel(options.modelId, options.fallbacks),
    system: COMPACT_SYSTEM,
    prompt: options.transcript,
    temperature: 0.2,
  });
  await persistAiUsage(options.client, options.billedTo, {
    source: options.source,
    modelId: options.modelId,
    usage: result.usage,
    ms: Date.now() - startedAt,
  });
  const text = result.text.replace(/\s+/g, " ").trim().slice(0, SUMMARY_MAX_CHARS);
  if (text) {
    return text;
  }
  return "Earlier chat covered budget work; details were compacted.";
}
