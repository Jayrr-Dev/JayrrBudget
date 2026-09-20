"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { displayAccountName } from "@/domains/dashboard/domain/accountName";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import { createVaultTransaction } from "@/domains/ledger-ai/application/applyVaultLedgerWrite";
import { vaultWriteReady } from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { toastIfOffline } from "@/shared/offline/offlineWriteGuard";
import { useConnectionState } from "@/shared/offline/useConnectionState";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Info, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseAmount(raw: string) {
  const value = Number(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value === 0) return null;
  return value;
}

export function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const { isOffline } = useConnectionState();
  const accounts = privateLedger.ledger.accounts;

  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayIso);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [moneyIn, setMoneyIn] = useState(false);

  const defaultAccountId = useMemo(
    () => accounts[0]?.accountId ?? "",
    [accounts],
  );

  useEffect(() => {
    if (!open) return;
    setAccountId(defaultAccountId);
    setDate(todayIso());
    setDescription("");
    setAmount("");
    setMoneyIn(false);
  }, [open, defaultAccountId]);

  const save = useMutation({
    mutationFn: async () => {
      if (toastIfOffline()) {
        throw new Error("You're offline. Try again when you're connected.");
      }
      const name = description.trim();
      if (!name) throw new Error("Description is required.");
      const parsed = parseAmount(amount);
      if (parsed === null) throw new Error("Enter an amount other than zero.");
      if (!accountId) throw new Error("Pick an account.");
      const write = vaultWriteReady({
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (!write) {
        throw new Error("Unlock your private ledger to add a transaction.");
      }
      const account = accounts.find((row) => row.accountId === accountId);
      const signed = moneyIn ? -Math.abs(parsed) : Math.abs(parsed);
      const result = await createVaultTransaction({
        input: {
          account: accountId,
          date,
          description: name,
          amount: signed,
          currency: account?.isoCurrencyCode ?? "CAD",
        },
        accounts,
        vaultWrite: write,
      });
      if (!result.ok) {
        throw new Error(result.error ?? "Could not add the transaction.");
      }
      privateLedger.reload();
      return result;
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Transaction added");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Could not add transaction", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  const noAccounts = accounts.length === 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={isOffline}
        onClick={() => setOpen(true)}
      >
        <PlusIcon data-icon="inline-start" />
        New transaction
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-6 p-6 sm:max-w-md">
          <DialogHeader className="gap-0 pr-8">
            <DialogTitle className="flex items-center gap-2">
              New transaction
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:text-primary"
                    aria-label="About new transaction"
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
                    <PopoverTitle>Manual ledger row</PopoverTitle>
                    <PopoverDescription>
                      Add a purchase or deposit without uploading a statement.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Pick the account the bank would show</li>
                      <li>Amount is spend unless you mark money in</li>
                      <li>Classify can label it after you save</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Add a purchase or deposit by hand. Pick an account, date,
              description, and amount.
            </DialogDescription>
          </DialogHeader>

          {noAccounts ? (
            <>
              <p className="text-sm text-muted-foreground">
                No accounts yet.{" "}
                <Link href="/statements" className="text-primary underline">
                  Import a statement
                </Link>{" "}
                first, then add rows here.
              </p>
              <DialogFooter className="-mx-5 -mb-5 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-txn-account">Account</Label>
                <NativeSelect
                  id="new-txn-account"
                  className="w-full"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  required
                  disabled={save.isPending}
                >
                  {accounts.map((account) => (
                    <NativeSelectOption
                      key={account.accountId}
                      value={account.accountId}
                    >
                      {displayAccountName(account)}
                      {account.mask ? ` ••${account.mask}` : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-txn-date">Date</Label>
                  <Input
                    id="new-txn-date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                    disabled={save.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-txn-amount">Amount</Label>
                  <Input
                    id="new-txn-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    required
                    disabled={save.isPending}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-txn-description">Description</Label>
                <Input
                  id="new-txn-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Store or payee"
                  required
                  disabled={save.isPending}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={moneyIn}
                  onCheckedChange={(checked) => setMoneyIn(checked === true)}
                  disabled={save.isPending}
                />
                This is money in
              </label>
              <DialogFooter className="-mx-5 -mb-5 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={save.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Add transaction"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
