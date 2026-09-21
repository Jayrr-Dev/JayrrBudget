"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import { applyVaultMerchantMerges } from "@/domains/merchants/application/applyVaultMerchantMerges";
import { planBankLineMerchantNames } from "@/domains/merchants/domain/planBankLineMerchantNames";
import { Spinner } from "@/components/ui/spinner";
import { vaultWriteReady } from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CleanResult = {
  clustersFound: number;
  mergesApplied: number;
  merchantsDeleted: number;
  transactionsUpdated: number;
  planOnly?: boolean;
  merges?: Array<{ canonicalName: string; merchantIds: string[] }>;
};

export function CleanMerchantsButton() {
  const privateLedger = usePrivateLedger();
  const cloudProcessing = useFeatureFlag("cloudProcessing");
  const client = useConvex();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(0);
  const [total, setTotal] = useState(0);
  const encrypted = Boolean(privateLedger.encryptedLedger);
  const blocked = encrypted && !cloudProcessing;

  const vaultProbes = useMemo(() => {
    if (!encrypted || !privateLedger.unlocked) return [];
    const counts = new Map<string, number>();
    for (const tx of privateLedger.ledger.transactions) {
      const name = tx.merchantClean ?? tx.merchantName ?? "";
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return privateLedger.ledger.merchants.map((merchant) => ({
      id: merchant.recordId,
      name: merchant.name,
      slug: merchant.merchantId,
      transactionCount: counts.get(merchant.name) ?? 0,
    }));
  }, [
    encrypted,
    privateLedger.unlocked,
    privateLedger.ledger.merchants,
    privateLedger.ledger.transactions,
  ]);

  async function runClean() {
    setBusy(true);
    setChecked(0);
    setTotal(vaultProbes.length);
    try {
      if (!encrypted) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const ctx = vaultWriteReady({
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (!ctx) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const response = await fetch("/api/merchants/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planOnly: true, merchants: vaultProbes }),
      });
      if (!response.ok || !response.body) {
        const failed = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(failed?.error ?? "Merchant clean failed");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let body: (CleanResult & { error?: string }) | null = null;
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;
          const event = JSON.parse(line) as {
            type?: string;
            checked?: number;
            total?: number;
            error?: string;
          } & CleanResult;
          if (event.type === "error") {
            throw new Error(event.error ?? "Merchant clean failed");
          }
          if (event.type === "progress") {
            setChecked(event.checked ?? 0);
            setTotal(event.total ?? vaultProbes.length);
            continue;
          }
          if (event.type === "result") body = event;
        }
      }
      if (!body) {
        throw new Error("Merchant clean failed");
      }
      if (!body.planOnly) {
        throw new Error("Merchant clean failed");
      }

      // Bank-internal lines (Monthly Plan Fee, Credit Interest) get the
      // institution from the ledger; that plan wins over the server plan.
      const bankRenames = planBankLineMerchantNames(privateLedger.ledger);
      const bankIds = new Set(bankRenames.flatMap((row) => row.merchantIds));
      const serverMerges = (body.merges ?? []).filter(
        (merge) => !merge.merchantIds.some((id) => bankIds.has(id)),
      );
      const applied = await applyVaultMerchantMerges({
        ctx,
        ledger: privateLedger.ledger,
        merges: [...bankRenames, ...serverMerges],
      });
      privateLedger.reload();
      const result: CleanResult = {
        clustersFound: body.clustersFound,
        mergesApplied: applied.mergesApplied,
        merchantsDeleted: applied.merchantsDeleted,
        transactionsUpdated: applied.transactionsUpdated,
      };

      setOpen(false);
      if (result.mergesApplied === 0) {
        toast.message(
          result.clustersFound === 0
            ? "Merchant names already look clean."
            : "Similar names found, but none should merge.",
        );
        return;
      }
      toast.success(
        `Cleaned ${result.mergesApplied} merchant name${result.mergesApplied === 1 ? "" : "s"}. ${result.transactionsUpdated} transaction${result.transactionsUpdated === 1 ? "" : "s"} updated.`,
      );
    } catch (error) {
      toast.error(errorMessage(error, "Merchant clean failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={blocked || busy}
        title={
          blocked ? "Turn on Cloud Processing to clean merchants." : undefined
        }
        onClick={() => setOpen(true)}
      >
        Clean
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Clean similar merchants
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:text-primary"
                    aria-label="About merchant clean"
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
                    <PopoverTitle>Clean similar merchants</PopoverTitle>
                    <PopoverDescription>
                      Turns statement lines into payee names and merges
                      near-duplicates.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>
                        Drops rails like Bill Payment, PAD, Direct Dep, EFT,
                        Online Payment
                      </li>
                      <li>Drops reference numbers so Affirm, Stripe, and Wealthsimple stay the brand</li>
                      <li>Jev merges names that are the same payee</li>
                      <li>
                        Fees and interest get the bank name (CIBC Monthly Plan
                        Fee)
                      </li>
                      <li>Fuzzy match finds close names (typos, locations)</li>
                      <li>AI keeps distinct services separate</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Strips payment rails, trailing account numbers, and names bank
              fees after the bank, then merges near-duplicate payee names.
              Merged payees keep every linked transaction.
            </DialogDescription>
          </DialogHeader>
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              <span className="tabular-nums">
                {total > 0 ? `${checked} of ${total}` : "Starting…"}
              </span>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void runClean()}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Cleaning…
                </span>
              ) : (
                "Run clean"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
