import type { DashboardData } from "@/domains/dashboard/domain/types";

const dashboardByLimit = new Map<string, DashboardData>();
let merchants: unknown[] | undefined;

function dashboardCacheKey(limit: number | null) {
  return limit == null ? "all" : String(limit);
}

export function rememberDashboard(limit: number | null, data: DashboardData) {
  dashboardByLimit.set(dashboardCacheKey(limit), data);
}

export function peekDashboard(limit: number | null) {
  return dashboardByLimit.get(dashboardCacheKey(limit));
}

export function rememberMerchants<T>(rows: T[]) {
  merchants = rows;
}

export function peekMerchants<T>() {
  return merchants as T[] | undefined;
}

export function clearLedgerQuerySnapshots() {
  dashboardByLimit.clear();
  merchants = undefined;
}
