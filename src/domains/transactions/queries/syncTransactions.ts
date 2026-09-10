import { parseJson } from "@/shared/lib/parse-json";

export async function requestSyncTransactions(options?: {
  resetCursor?: boolean;
  waitForHistory?: boolean;
}) {
  const response = await fetch("/api/plaid/sync-transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resetCursor: options?.resetCursor ?? false,
      waitForHistory: options?.waitForHistory ?? true,
    }),
  });
  return parseJson<{
    ok: boolean;
    added?: number;
    modified?: number;
    removed?: number;
    pages?: number;
    earliest_date?: string | null;
    latest_date?: string | null;
    days_requested?: number;
    message?: string;
  }>(response);
}
