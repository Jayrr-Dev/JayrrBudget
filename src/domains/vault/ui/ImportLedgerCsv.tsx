"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getVaultMasterKey } from "@/crypto/session";
import type { MutationClient } from "@/crypto/vaultRecords";
import {
  hydrateVaultSession,
  type VaultClient,
} from "@/domains/vault/application/ensureVaultFromPasscode";
import { importPrivateCsv } from "@/domains/vault/application/importPrivateCsv";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import { toast } from "sonner";

const IMPORT_TOAST = "ledger-csv-import";

function CsvImportHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
          aria-label="How CSV import works"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <Info className="size-3.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Import CSV</PopoverTitle>
          <PopoverDescription>
            Adds bank export rows to your encrypted ledger.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Works with comma, semicolon, tab, or pipe files.</li>
            <li>Needs date, description, and amount (or debit/credit).</li>
            <li>
              Odd headers or extra title rows are cleaned with AI, then saved
              encrypted.
            </li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

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
    toast.loading("Reading CSV…", { id: IMPORT_TOAST });
    const result = await importPrivateCsv(client as unknown as MutationClient, {
      userId: privateLedger.userId,
      vaultId,
      keyId,
      masterKey,
      file,
      onAiStart: () => {
        toast.loading("Cleaning CSV with AI…", { id: IMPORT_TOAST });
      },
    });
    privateLedger.reload();
    await onImported?.();
    toast.success(
      result.usedAi
        ? `Cleaned with AI, then imported ${result.saved} rows.`
        : `Imported ${result.saved} rows.`,
      { id: IMPORT_TOAST },
    );
  }

  const fileInput = (
    <input
      type="file"
      accept=".csv,text/csv,text/tab-separated-values,.tsv,.txt"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        void upload(file).catch((cause) =>
          toast.error(
            cause instanceof Error ? cause.message : "Could not import CSV.",
            { id: IMPORT_TOAST },
          ),
        );
      }}
    />
  );

  if (variant === "item") {
    return (
      <label className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-primary-subtle hover:text-primary-subtle-foreground">
        Import CSV
        <CsvImportHelp />
        {fileInput}
      </label>
    );
  }

  return (
    <Button type="button" variant="outline" asChild>
      <label className="cursor-pointer gap-1">
        Import CSV
        <CsvImportHelp />
        {fileInput}
      </label>
    </Button>
  );
}
