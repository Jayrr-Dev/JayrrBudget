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
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

export type EditableMerchant = {
  id: string;
  name: string;
  logoUrl: string | null;
  logoSrc?: string | null;
};

type Props = {
  merchant: EditableMerchant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function transactionNoun(count: number) {
  return count === 1 ? "transaction" : "transactions";
}

function impactCopy(
  affectedCount: number,
  mergeIntoName: string | null,
): string {
  const noun = transactionNoun(affectedCount);
  if (mergeIntoName) {
    return `Merges into ${mergeIntoName}. ${affectedCount} ${noun} will be affected.`;
  }
  return `${affectedCount} ${noun} will be affected.`;
}

export function EditMerchantDialog({ merchant, open, onOpenChange }: Props) {
  const update = useMutation(api.merchants.update);
  const generateLogoUploadUrl = useMutation(
    api.merchants.generateLogoUploadUrl,
  );
  const privateLedger = usePrivateLedger();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [pendingStorageId, setPendingStorageId] =
    useState<Id<"_storage"> | null>(null);
  const [busy, setBusy] = useState(false);

  const convexImpactArgs =
    open && merchant != null && !privateLedger.encryptedLedger
      ? {
          merchantId: merchant.id as Id<"merchants">,
          name,
        }
      : "skip";
  const convexImpact = useQuery(api.merchants.editImpact, convexImpactArgs);

  const encryptedAffectedCount = useMemo(() => {
    if (!privateLedger.encryptedLedger || !merchant) return 0;
    const label = merchant.name;
    let count = 0;
    for (const tx of privateLedger.ledger.transactions) {
      const txLabel = tx.merchantClean ?? tx.merchantName ?? null;
      if (txLabel === label) count += 1;
    }
    return count;
  }, [
    merchant,
    privateLedger.encryptedLedger,
    privateLedger.ledger.transactions,
  ]);

  const impactLabel = (() => {
    if (!open || !merchant) return null;
    if (privateLedger.encryptedLedger) {
      return impactCopy(encryptedAffectedCount, null);
    }
    if (convexImpact === undefined) return "Checking linked transactions…";
    return impactCopy(
      convexImpact.affectedCount,
      convexImpact.merge ? convexImpact.mergeIntoName : null,
    );
  })();

  useEffect(() => {
    if (!open || !merchant) return;
    setName(merchant.name);
    setLogoUrl(merchant.logoUrl ?? "");
    setPreviewSrc(merchant.logoSrc ?? merchant.logoUrl ?? null);
    setPendingStorageId(null);
  }, [open, merchant]);

  async function onPickLogo(file: File | undefined) {
    if (!file || privateLedger.encryptedLedger) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logo must be 2 MB or smaller");
      return;
    }
    setBusy(true);
    const localUrl = URL.createObjectURL(file);
    setPreviewSrc(localUrl);
    try {
      const uploadUrl = await generateLogoUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      const payload = (await response.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("Upload failed");
      }
      setPendingStorageId(payload.storageId as Id<"_storage">);
    } catch (error) {
      setPreviewSrc(merchant?.logoSrc ?? merchant?.logoUrl ?? null);
      toast.error(errorMessage(error, "Could not upload logo"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!merchant) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Merchant name is required");
      return;
    }
    setBusy(true);
    try {
      const result = await update({
        merchantId: merchant.id as Id<"merchants">,
        name: trimmed,
        logoUrl: logoUrl.trim() || null,
        logoStorageId: pendingStorageId ?? undefined,
      });
      if (result.merged) {
        toast.success(`Merged into ${result.merchant.name}`, {
          description: `${result.transactionsUpdated} ledger row${
            result.transactionsUpdated === 1 ? "" : "s"
          } moved.`,
        });
      } else {
        toast.success(`Saved ${result.merchant.name}`, {
          description:
            result.transactionsUpdated > 0
              ? `${result.transactionsUpdated} linked ledger row${
                  result.transactionsUpdated === 1 ? "" : "s"
                } updated.`
              : undefined,
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Could not save merchant"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit merchant
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
                    aria-label="Edit merchant info"
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
                    <PopoverTitle>Edit merchant</PopoverTitle>
                    <PopoverDescription>
                      Change this payee. Linked ledger rows follow.
                    </PopoverDescription>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Name and logo only</li>
                      <li>Upload an image or paste a logo URL</li>
                      <li>
                        Same name as another merchant merges this row into that
                        one
                      </li>
                    </ul>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Change this payee. Same name as another merchant merges them.
              Linked ledger rows follow.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="merchant-name">Name</Label>
              <Input
                id="merchant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
                disabled={busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-control-border bg-surface-elevated">
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt=""
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  disabled={busy || privateLedger.encryptedLedger}
                  onChange={(event) => {
                    void onPickLogo(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || privateLedger.encryptedLedger}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload image
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="merchant-logo">Logo URL</Label>
              <Input
                id="merchant-logo"
                value={logoUrl}
                onChange={(event) => {
                  const next = event.target.value;
                  setLogoUrl(next);
                  if (!pendingStorageId) {
                    setPreviewSrc(next.trim() || null);
                  }
                }}
                placeholder="https://"
                disabled={busy}
              />
            </div>
          </div>
          <DialogFooter className="sm:items-center sm:justify-between">
            {impactLabel ? (
              <p
                role="status"
                className="text-sm text-muted-foreground sm:mr-auto"
              >
                {impactLabel}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
