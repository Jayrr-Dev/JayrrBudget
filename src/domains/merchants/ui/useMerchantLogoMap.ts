"use client";

import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";

export function useMerchantLogoMap() {
  const privateLedger = usePrivateLedger();
  const merchants = useQuery(
    api.merchants.list,
    privateLedger.encryptedLedger ? "skip" : {},
  );
  return useMemo(() => {
    const map = new Map<string, string>();
    if (privateLedger.encryptedLedger) {
      for (const row of privateLedger.ledger.merchants) {
        if (!row.logoUrl) continue;
        map.set(row.name, row.logoUrl);
      }
      return map;
    }
    if (!merchants) return map;
    for (const row of merchants) {
      const src = row.logoSrc ?? row.logoUrl;
      if (!src) continue;
      map.set(row.name, src);
    }
    return map;
  }, [
    merchants,
    privateLedger.encryptedLedger,
    privateLedger.ledger.merchants,
  ]);
}
