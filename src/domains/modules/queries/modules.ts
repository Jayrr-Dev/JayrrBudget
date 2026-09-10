import { parseJson } from "@/shared/lib/parse-json";
import type { AppModuleRecord } from "@/domains/modules/domain/types";

export async function fetchModules(options?: { enabledOnly?: boolean }) {
  const query = options?.enabledOnly ? "?enabled=1" : "";
  const response = await fetch(`/api/modules${query}`, { cache: "no-store" });
  return parseJson<{ ok: true; modules: AppModuleRecord[] }>(response);
}

export async function updateModuleEnabled(slug: string, enabled: boolean) {
  const response = await fetch(`/api/modules/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return parseJson<{ ok: true }>(response);
}
