import { parseJson } from "@/shared/lib/parse-json";

export async function removeLinkedBanks() {
  const response = await fetch("/api/plaid/items", { method: "DELETE" });
  return parseJson<{
    ok: boolean;
    removed_items?: number;
    message?: string;
  }>(response);
}
