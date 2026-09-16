"use client";

import { VaultSecurityCard } from "@/components/layout/VaultSecurityCard";
import { DecryptingStatus } from "@/domains/vault/ui/DecryptingStatus";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";

export function useVaultPageLocked() {
  const privateLedger = usePrivateLedger();
  return privateLedger.encryptedLedger && !privateLedger.unlocked;
}

export function VaultLockedGate({ children }: { children: React.ReactNode }) {
  const privateLedger = usePrivateLedger();
  if (!privateLedger.encryptedLedger || privateLedger.unlocked) {
    return children;
  }

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="w-full max-w-md">
        {privateLedger.loading ? (
          <div className="flex justify-center py-10">
            <DecryptingStatus />
          </div>
        ) : (
          <VaultSecurityCard />
        )}
      </div>
    </div>
  );
}
