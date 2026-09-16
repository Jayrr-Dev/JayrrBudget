"use client";

import { useFeatureFlags } from "@/domains/feature-flags/ui/useFeatureFlag";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useDashboard } from "@/domains/dashboard/ui/DashboardPanels";

/** Keep ledger queries subscribed while the shell is mounted so pages skip the spinner. */
export function WarmSaasQueries() {
  const { isAuthenticated } = useConvexAuth();
  const privateLedger = usePrivateLedger();
  useFeatureFlags();
  useDashboard(250);
  useDashboard(null);
  useQuery(
    api.merchants.list,
    isAuthenticated && !privateLedger.encryptedLedger ? {} : "skip",
  );
  return null;
}
