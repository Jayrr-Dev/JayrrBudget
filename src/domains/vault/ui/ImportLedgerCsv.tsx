"use client";

import { useConvex } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { hydrateVaultSession, type VaultClient } from "@/domains/vault/application/ensureVaultFromPasscode";
import { importPrivateCsv } from "@/domains/vault/application/importPrivateCsv";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";

export function ImportLedgerCsv({ onImported }: { onImported?: () => void | Promise<void> }) {
  const client = useConvex();
  const privateLedger = usePrivateLedger();

  async function upload(file: File) {
    const opened = await hydrateVaultSession(client as unknown as VaultClient);
    const masterKey = getVaultMasterKey();
    const vaultId = privateLedger.vaultId ?? opened?.vaultId ?? null;
    const keyId = privateLedger.keyId ?? opened?.keyId ?? null;
    if (!privateLedger.userId || !vaultId || !keyId || !masterKey) {
      throw new Error("Sign in again, then import the CSV.");
    }
    await importPrivateCsv(client as unknown as MutationClient, {
      userId: privateLedger.userId,
      vaultId,
      keyId,
      masterKey,
      file,
    });
    privateLedger.reload();
    await onImported?.();
  }

  return (
    <Button type="button" variant="outline" asChild>
      <label className="cursor-pointer">
        Import CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void upload(file)
              .then(() => toast.success("CSV imported."))
              .catch((cause) => toast.error(cause instanceof Error ? cause.message : "Could not import CSV."));
          }}
        />
      </label>
    </Button>
  );
}
