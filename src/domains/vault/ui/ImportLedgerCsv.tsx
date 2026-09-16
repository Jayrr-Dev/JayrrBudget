"use client";

import { Button } from "@/components/ui/button";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import { importPrivateCsv } from "@/domains/vault/application/importPrivateCsv";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useConvex } from "convex/react";
import { toast } from "sonner";

export function ImportLedgerCsv({
  onImported,
  variant = "button",
}: {
  onImported?: () => void | Promise<void>;
  /** `item` fits inside a dropdown menu row. */
  variant?: "button" | "item";
}) {
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

  const fileInput = (
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
          .catch((cause) =>
            toast.error(
              cause instanceof Error ? cause.message : "Could not import CSV.",
            ),
          );
      }}
    />
  );

  if (variant === "item") {
    return (
      <label className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-primary-subtle hover:text-primary-subtle-foreground">
        Import CSV
        {fileInput}
      </label>
    );
  }

  return (
    <Button type="button" variant="outline" asChild>
      <label className="cursor-pointer">
        Import CSV
        {fileInput}
      </label>
    </Button>
  );
}
