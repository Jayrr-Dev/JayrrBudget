import { requestUpgradePrompt } from "@/shared/lib/upgradePromptEvents";
import { isUpgradeOfferText } from "@convex/lib/aiCap";

function unwrapJsonError(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: unknown;
      code?: unknown;
    };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
    if (typeof parsed.code === "string") return parsed.code;
  } catch {
    return null;
  }
  return null;
}

function coerceMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return unwrapJsonError(error.message) ?? error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return unwrapJsonError(error) ?? error;
  }
  return fallback;
}

/** Human-readable message from any thrown value. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  const message = coerceMessage(error, fallback);
  if (isUpgradeOfferText(message)) {
    requestUpgradePrompt(message);
  }
  return message;
}
