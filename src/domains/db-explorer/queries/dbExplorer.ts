import { parseJson } from "@/shared/lib/parse-json";
import type {
  DbSchemaGraph,
  DbTableBrowseResult,
} from "@/domains/db-explorer/domain/types";

export async function fetchDbSchema() {
  const response = await fetch("/api/db/schema", { cache: "no-store" });
  return parseJson<{ ok: true; schema: DbSchemaGraph }>(response);
}

export async function fetchDbTable(
  table: string,
  options?: { limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  const query = params.toString();
  const response = await fetch(
    `/api/db/tables/${encodeURIComponent(table)}${query ? `?${query}` : ""}`,
    { cache: "no-store" },
  );
  return parseJson<{ ok: true; data: DbTableBrowseResult }>(response);
}
