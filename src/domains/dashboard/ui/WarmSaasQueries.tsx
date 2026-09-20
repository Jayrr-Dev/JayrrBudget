"use client";

import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";

/** Keep ledger queries subscribed while the shell is mounted so pages skip the spinner. */
export function WarmSaasQueries() {
  useDashboard(250);
  useDashboard(null);
  return null;
}
