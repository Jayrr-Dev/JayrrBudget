import type { DashboardData } from "@/domains/dashboard/domain/types";
import type { AppModuleRecord } from "@/domains/modules/domain/types";

const dashboardByLimit = new Map<string, DashboardData>();
let merchants: unknown[] | undefined;
let modulesList: AppModuleRecord[] | undefined;
let lastViewSavedAt: number | undefined;
let lastViewHydrateDone = false;
let snapshotVersion = 0;
const snapshotListeners = new Set<() => void>();

function dashboardCacheKey(limit: number | null) {
  return limit == null ? "all" : String(limit);
}

function bumpSnapshots() {
  snapshotVersion += 1;
  for (const listener of snapshotListeners) listener();
}

export function subscribeLedgerSnapshots(onStoreChange: () => void) {
  snapshotListeners.add(onStoreChange);
  return () => {
    snapshotListeners.delete(onStoreChange);
  };
}

export function getLedgerSnapshotVersion() {
  return snapshotVersion;
}

export function rememberDashboard(limit: number | null, data: DashboardData) {
  const key = dashboardCacheKey(limit);
  if (dashboardByLimit.get(key) === data) return false;
  dashboardByLimit.set(key, data);
  bumpSnapshots();
  return true;
}

export function peekDashboard(limit: number | null) {
  return dashboardByLimit.get(dashboardCacheKey(limit));
}

export function rememberMerchants<T>(rows: T[]) {
  merchants = rows;
  bumpSnapshots();
}

export function peekMerchants<T>() {
  return merchants as T[] | undefined;
}

export function rememberModules(modules: AppModuleRecord[]) {
  if (modulesList === modules) return false;
  modulesList = modules;
  bumpSnapshots();
  return true;
}

export function peekModules() {
  return modulesList;
}

export function rememberLastViewSavedAt(savedAt: number) {
  if (lastViewSavedAt === savedAt) return;
  lastViewSavedAt = savedAt;
  bumpSnapshots();
}

export function peekLastViewSavedAt() {
  return lastViewSavedAt;
}

export function markLastViewHydrateDone() {
  lastViewHydrateDone = true;
  bumpSnapshots();
}

export function isLastViewHydrateDone() {
  return lastViewHydrateDone;
}

export function clearLedgerQuerySnapshots() {
  dashboardByLimit.clear();
  merchants = undefined;
  modulesList = undefined;
  lastViewSavedAt = undefined;
  lastViewHydrateDone = true;
  bumpSnapshots();
}
