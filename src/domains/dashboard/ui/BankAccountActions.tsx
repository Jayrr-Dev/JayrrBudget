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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import {
  displayAccountName,
  normalizeAccountLabel,
} from "@/domains/dashboard/domain/accountName";
import type { DashboardAccount } from "@/domains/dashboard/domain/types";
import {
  saveEncryptedAccountLabel,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import {
  skipNextPrivateLedgerReload,
  usePrivateLedger,
} from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex, useMutation as useConvexMutation } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function BankAccountActions({
  account,
  size = "xs",
}: {
  account: DashboardAccount;
  size?: "xs" | "sm";
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <RowActionsMenu
        label={displayAccountName(account)}
        size={size}
        actions={[
          {
            label: "Edit label",
            onSelect: () => setEditOpen(true),
          },
        ]}
      />
      <EditAccountLabelDialog
        account={account}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

function EditAccountLabelDialog({
  account,
  open,
  onOpenChange,
}: {
  account: DashboardAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const updateConvexLabel = useConvexMutation(api.accounts.updateLabel);
  const [label, setLabel] = useState(account.label ?? "");

  useEffect(() => {
    if (!open) return;
    setLabel(account.label ?? "");
  }, [account.label, open]);

  const save = useMutation({
    mutationFn: async () => {
      const nextLabel = normalizeAccountLabel(label);
      const write = vaultWriteReady({
        encryptedLedger: privateLedger.encryptedLedger,
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (write) {
        const nextLedger = await saveEncryptedAccountLabel(
          write,
          privateLedger.ledger,
          account,
          nextLabel,
        );
        skipNextPrivateLedgerReload();
        privateLedger.applyLedger(nextLedger);
        return;
      }
      if (privateLedger.encryptedLedger) {
        throw new Error("Unlock the vault to edit this account label.");
      }
      await updateConvexLabel({
        accountId: account.accountId,
        label: nextLabel,
      });
    },
    onSuccess: async () => {
      onOpenChange(false);
      toast.success("Account label saved");
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: (error) => {
      toast.error("Could not save label", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Account label
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:text-primary"
                    aria-label="Account label info"
                  >
                    <Info className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-72">
                  <PopoverHeader>
                    <PopoverTitle>Account label</PopoverTitle>
                    <PopoverDescription>
                      Nickname for this account on the dashboard.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Leave blank to show the original name</li>
                      <li>The account id used by statements stays the same</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Nickname for this account. The original name and account id stay
              the same.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="account-label">Label</Label>
            <Input
              id="account-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={account.name}
              disabled={save.isPending}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
