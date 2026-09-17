"use client";

import type { FeatureFlagKey } from "@/domains/feature-flags/domain/keys";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

/** Defaults to off while loading or signed out. */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { isAuthenticated } = useConvexAuth();
  const row = useQuery(
    api.featureFlags.get,
    isAuthenticated ? { key } : "skip",
  );
  return Boolean(row?.enabled);
}

export function useFeatureFlags() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.featureFlags.list, isAuthenticated ? {} : "skip");
  return {
    loading: isAuthenticated && rows === undefined,
    flags: rows ?? [],
    encryptedLedger: Boolean(
      rows?.find((row) => row.key === "encryptedLedger")?.enabled,
    ),
    cloudProcessing: Boolean(
      rows?.find((row) => row.key === "cloudProcessing")?.enabled,
    ),
    jevCategorization: Boolean(
      rows?.find((row) => row.key === "jevCategorization")?.enabled,
    ),
    jevPiggy: Boolean(rows?.find((row) => row.key === "jevPiggy")?.enabled),
  };
}
