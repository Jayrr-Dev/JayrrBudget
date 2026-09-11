import type { DashboardData } from "@/domains/dashboard/domain/types";
import { parseJson } from "@/shared/lib/parse-json";

export async function fetchDashboard(options?: {
  limit?: number | "all";
}): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (options?.limit === "all") params.set("limit", "all");
  else if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  const response = await fetch(
    query ? `/api/dashboard?${query}` : "/api/dashboard",
  );
  return parseJson<DashboardData>(response);
}
