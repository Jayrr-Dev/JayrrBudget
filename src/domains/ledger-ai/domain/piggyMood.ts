export type PiggyEmote =
  | "neutral" | "happy" | "sad" | "angry" | "surprised"
  | "sleepy" | "love" | "confused" | "excited" | "thinking";

export type PiggyMood = PiggyEmote | "still" | "idle" | "listen" | "think" | "talk";

export const piggyEmoteForMood: Record<PiggyMood, PiggyEmote> = {
  still: "neutral", idle: "happy", listen: "neutral", think: "thinking", talk: "happy",
  neutral: "neutral", happy: "happy", sad: "sad", angry: "angry",
  surprised: "surprised", sleepy: "sleepy", love: "love", confused: "confused",
  excited: "excited", thinking: "thinking",
};

type Message = {
  role: string;
  parts: ReadonlyArray<{ type: string; text?: string; state?: string; output?: unknown; toolCallId?: string }>;
};

function isTool(part: Message["parts"][number]) {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

/** Only react to the assistant's reply, never judge the user's spending or mood. */
export function piggyMoodFromMessage(message?: Message, boardErrors?: ReadonlyMap<string, string>): PiggyMood {
  if (!message || message.role !== "assistant") return "happy";
  if (message.parts.some((p) => isTool(p) && (
    p.state === "output-error" ||
    (p.toolCallId && boardErrors?.has(p.toolCallId)) ||
    (p.output && typeof p.output === "object" && "error" in p.output && p.output.error)
  ))) return "sad";
  if (message.parts.some((p) => isTool(p) && p.state === "output-denied")) return "confused";
  const text = message.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("").trim();
  // Deliberately narrow cues; financial words alone don't imply an emotion.
  if (/\b(could you clarify|can you clarify|which .{0,60} did you mean|need more information)\b/i.test(text) || /\?\s*$/.test(text)) return "confused";
  if (/^(?:i['’]m sorry|sorry[,! ]|unfortunately\b)/i.test(text)) return "sad";
  if (/\b(congratulations|congrats|you (?:hit|reached) your goal)\b/i.test(text)) return "excited";
  if (/^(?:you['’]re welcome|happy to help|glad i could help)\b/i.test(text)) return "love";
  if (/^(?:wow|whoa)[,!]/i.test(text)) return "surprised";
  return "happy";
}

/** Live activity wins over stale errors or the previous answer's expression. */
export function piggyMoodFromChat({ status, listening, message, error, blocked, boardErrors }: {
  status: string;
  listening: boolean;
  message?: Message;
  error?: unknown;
  blocked?: boolean;
  boardErrors?: ReadonlyMap<string, string>;
}): PiggyMood {
  if (status === "submitted") return "thinking";
  if (status === "streaming") {
    const last = message?.role === "assistant" ? message.parts.at(-1) : undefined;
    return last?.type === "text" && last.text?.trim() ? "happy" : "thinking";
  }
  if (error || status === "error") return "sad";
  if (blocked) return "confused";
  if (listening) return "neutral";
  return piggyMoodFromMessage(message, boardErrors);
}
