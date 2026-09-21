"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { clearVaultCiphertextCache } from "@/crypto/ciphertextCache";
import { forgetPrivateLedgerMemo } from "@/domains/vault/application/loadPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import {
  isFullyLocal,
  setFullyLocal,
  subscribeFullyLocal,
} from "@/shared/offline/fullyLocalMode";
import { Info } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  return subscribeFullyLocal(onStoreChange);
}

export function FullyLocalSwitch() {
  const enabled = useSyncExternalStore(subscribe, isFullyLocal, () => false);
  const ledger = usePrivateLedger();

  return (
    <div className="flex items-center gap-2">
      <Switch
        size="lg"
        checked={enabled}
        aria-label="Fully local"
        onCheckedChange={(checked) => {
          const next = Boolean(checked);
          void (async () => {
            if (!next && ledger.vaultId) {
              await clearVaultCiphertextCache(ledger.vaultId);
            }
            setFullyLocal(next);
            forgetPrivateLedgerMemo();
            ledger.reload();
          })();
        }}
      />
      <span className="inline-flex items-center gap-1 text-sm font-medium">
        Fully local
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About fully local"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-80 gap-0 p-3.5"
          >
            <PopoverHeader className="gap-1.5">
              <PopoverTitle>Fully local</PopoverTitle>
              <PopoverDescription>
                Keep the ledger on this device.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Rows stay encrypted in this browser&apos;s IndexedDB</li>
                <li>New edits are not uploaded</li>
                <li>Turning this off loads the cloud copy again</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );
}
