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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { analysisQueryKeys } from "@/domains/analysis/queries/query-keys";
import { queryKeys } from "@/domains/dashboard/queries/query-keys";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import {
  renameEncryptedDescriptions,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { Icon } from "@iconify/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

async function postRename(from: string, to: string) {
  const response = await fetch("/api/transactions/rename-descriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  const data = (await response.json()) as
    | { ok: true; updated: number }
    | { ok?: false; error: string };
  if (!response.ok || !("updated" in data)) {
    throw new Error("error" in data ? data.error : "Failed to rename");
  }
  return data.updated;
}

export function EditDescriptionDialog({
  open,
  onOpenChange,
  currentDescription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDescription: string;
}) {
  const queryClient = useQueryClient();
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const [nextDescription, setNextDescription] = useState(currentDescription);

  useEffect(() => {
    if (open) setNextDescription(currentDescription);
  }, [open, currentDescription]);

  const matchCount = useMemo(() => {
    if (!privateLedger.encryptedLedger) return null;
    return privateLedger.ledger.transactions.filter(
      (tx) => tx.description === currentDescription,
    ).length;
  }, [
    privateLedger.encryptedLedger,
    privateLedger.ledger.transactions,
    currentDescription,
  ]);

  const save = useMutation({
    mutationFn: async () => {
      const to = nextDescription.trim();
      if (!to) throw new Error("Description is required");
      if (to === currentDescription) return 0;
      const write = vaultWriteReady({
        encryptedLedger: privateLedger.encryptedLedger,
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (write) {
        const updated = await renameEncryptedDescriptions(
          write,
          privateLedger.ledger.transactions,
          currentDescription,
          to,
        );
        privateLedger.reload();
        return updated;
      }
      return postRename(currentDescription, to);
    },
    onSuccess: async (updated) => {
      onOpenChange(false);
      toast.success(
        updated === 1
          ? "Updated 1 transaction"
          : `Updated ${updated} transactions`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: dbExplorerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
      ]);
    },
    onError: (error) =>
      toast.error("Could not edit description", {
        description: error instanceof Error ? error.message : String(error),
      }),
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
              Edit description
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Edit description info"
                  >
                    <Info className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="bottom" className="w-72">
                  <PopoverHeader>
                    <PopoverTitle>Edit description</PopoverTitle>
                    <PopoverDescription>
                      Change this statement line everywhere it appears.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Every transaction with this exact text is updated</li>
                      <li>Original description stays as the bank printed it</li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Updates every transaction with this exact description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="edit-txn-description">Description</Label>
            <Input
              id="edit-txn-description"
              value={nextDescription}
              onChange={(event) => setNextDescription(event.target.value)}
              disabled={save.isPending}
              autoFocus
            />
            {matchCount != null ? (
              <p className="text-xs text-muted-foreground">
                {matchCount === 1
                  ? "1 transaction has this text."
                  : `${matchCount} transactions have this text.`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                All transactions with this exact text will change.
              </p>
            )}
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

export function DescriptionActionsButton({
  description,
  onEdit,
}: {
  description: string;
  onEdit: (description: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label={`Actions for ${description}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Icon icon="basil:menu-outline" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36">
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => {
            window.setTimeout(() => onEdit(description), 0);
          }}
        >
          Edit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
