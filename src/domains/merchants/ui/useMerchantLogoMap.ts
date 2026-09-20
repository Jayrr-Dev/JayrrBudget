"use client";

import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useMemo } from "react";

export function useMerchantLogoMap() {
  const privateLedger = usePrivateLedger();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of privateLedger.ledger.merchants) {
      if (!row.logoUrl) continue;
      map.set(row.name, row.logoUrl);
    }
    return map;
  }, [privateLedger.ledger.merchants]);
}
