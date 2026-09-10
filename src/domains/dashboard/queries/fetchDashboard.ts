import type { DashboardData } from "@/domains/dashboard/domain/types";
import { parseJson } from "@/shared/lib/parse-json";

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard");
  return parseJson<DashboardData>(response);
}
