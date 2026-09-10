import { APICallError } from "ai";
import { errorMessage } from "@/shared/lib/error-message";

export { errorMessage };

const AUTH_STATUS = new Set([401, 403]);

function isSchemaOrParseFailure(message: string) {
  return /NoObjectGenerated|did not match schema|invalid_schema|Failed to parse|could not parse|JSON parsing|unparseable/i.test(
    message,
  );
}

/**
 * Whether the next model in the chain should be tried.
 * Auth failures stay fatal. Timeouts, 5xx, schema misses, and missing models fallback.
 */
export function isRetryableAiError(error: unknown): boolean {
  const message = errorMessage(error);

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (AUTH_STATUS.has(status)) return false;
    if (status === 404) return true;
    if (status === 400) {
      return (
        isSchemaOrParseFailure(message) ||
        /model|not found|unavailable/i.test(message)
      );
    }
    if (
      status === 408 ||
      status === 429 ||
      status >= 500 ||
      isSchemaOrParseFailure(message)
    ) {
      return true;
    }
  }

  if (
    /unauthor|api key|invalid key|OPENROUTER_API_KEY|MISTRAL_API_KEY/i.test(
      message,
    )
  ) {
    return false;
  }

  if (
    isSchemaOrParseFailure(message) ||
    /rate-limited|overloaded|timeout|temporar|ECONNRESET|fetch failed|network|unavailable|aborted|AbortError/i.test(
      message,
    )
  ) {
    return true;
  }

  return false;
}

/** Retry a call a few times when the error looks transient. */
export async function retryOn<T>(
  fn: () => Promise<T>,
  options?: {
    attempts?: number;
    delayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  },
): Promise<T> {
  const attempts = options?.attempts ?? 2;
  const delayMs = options?.delayMs ?? 400;
  const shouldRetry = options?.shouldRetry ?? isRetryableAiError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(errorMessage(lastError));
}
