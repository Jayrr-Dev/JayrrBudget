"use client";

import { VaultSecurityCard } from "@/components/layout/VaultSecurityCard";
import { Spinner } from "@/components/ui/spinner";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";

export function useVaultPageLocked() {
  const privateLedger = usePrivateLedger();
  return (
    privateLedger.encryptedLedger && !privateLedger.unlocked
  );
}

export function VaultLockedGate({ children }: { children: React.ReactNode }) {
  const privateLedger = usePrivateLedger();
  if (!privateLedger.encryptedLedger || privateLedger.unlocked) {
    return children;
  }

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="w-full max-w-md">
        {privateLedger.loading && !privateLedger.vaultReady ? (
          <div
            className="flex justify-center py-10 text-[var(--muted-foreground)]"
            role="status"
            aria-live="polite"
            aria-label="Loading vault"
          >
            <Spinner className="size-6" />
          </div>
        ) : (
          <VaultSecurityCard />
        )}
      </div>
    </div>
  );
}
