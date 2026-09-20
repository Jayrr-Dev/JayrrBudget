import { MAX_CSV_CHARS, type NormalizedCsv } from "@/domains/vault/domain/normalizedCsv";
import { assertOnlineForWrite } from "@/shared/offline/offlineWriteGuard";

export async function fetchNormalizedCsv(text: string): Promise<NormalizedCsv> {
  assertOnlineForWrite();
  const response = await fetch("/api/ledger/normalize-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, MAX_CSV_CHARS) }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (NormalizedCsv & { error?: string })
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : `Could not clean that CSV (${response.status}).`,
    );
  }
  if (!payload || !("kind" in payload)) {
    throw new Error("Could not clean that CSV.");
  }
  return payload;
}
