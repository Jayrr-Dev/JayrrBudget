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
import { toSlug } from "@/domains/enrichment/domain/slug";
import { MerchantLogoAvatar } from "@/domains/merchants/ui/MerchantLogoAvatar";
import {
  saveEncryptedMerchant,
  saveEncryptedRecords,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import {
  blobToDataUrl,
  optimizeImageToWebpAvatar,
} from "@/shared/lib/optimizeImageToWebp";
import { useConvex } from "convex/react";
import { Info } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
const TX_CHUNK = 40;

export type EditableMerchant = {
  id: string;
  name: string;
  slug?: string;
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
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const encryptedAffectedCount = useMemo(() => {
    if (!merchant) return 0;
    const label = merchant.name;
    let count = 0;
    for (const tx of privateLedger.ledger.transactions) {
      const txLabel = tx.merchantClean ?? tx.merchantName ?? null;
      if (txLabel === label) count += 1;
    }
    return count;
  }, [merchant, privateLedger.ledger.transactions]);

  const impactLabel =
    open && merchant ? impactCopy(encryptedAffectedCount, null) : null;

  const replacePreview = useCallback((next: string | null) => {
    setPreviewSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open || !merchant) return;
    setName(merchant.name);
    setLogoUrl(merchant.logoUrl ?? "");
    replacePreview(merchant.logoSrc ?? merchant.logoUrl ?? null);
    setPendingLogoDataUrl(null);
  }, [open, merchant, replacePreview]);

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logo must be 2 MB or smaller");
      return;
    }
    setBusy(true);
    try {
      if (!privateLedger.encryptedLedger) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const optimized = await optimizeImageToWebpAvatar(file);
      const dataUrl = await blobToDataUrl(optimized);
      replacePreview(dataUrl);
      setPendingLogoDataUrl(dataUrl);
    } catch (error) {
      replacePreview(merchant?.logoSrc ?? merchant?.logoUrl ?? null);
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
      const write = vaultWriteReady({
        encryptedLedger: privateLedger.encryptedLedger,
        userId: privateLedger.userId,
        vaultId: privateLedger.vaultId,
        keyId: privateLedger.keyId,
        client,
      });
      if (!write) {
        throw new Error("Unlock your private ledger to edit.");
      }
      const existing = privateLedger.ledger.merchants.find(
        (row) => row.recordId === merchant.id || row.name === merchant.name,
      );
      const merchantId =
        existing?.merchantId ?? merchant.slug ?? toSlug(trimmed) ?? trimmed;
      const nextLogo =
        pendingLogoDataUrl ?? (logoUrl.trim() || existing?.logoUrl || null);
      await saveEncryptedMerchant(write, {
        merchantId,
        name: trimmed,
        rawName: existing?.rawName ?? trimmed,
        company: existing?.company ?? null,
        brand: existing?.brand ?? null,
        website: existing?.website ?? null,
        logoUrl: nextLogo,
        expectedRevision: existing?.revision ?? null,
      });
      const previous = merchant.name.trim();
      if (previous && previous !== trimmed) {
        const matches = privateLedger.ledger.transactions.filter((tx) => {
          const label = (tx.merchantClean ?? tx.merchantName ?? "").trim();
          return label === previous;
        });
        for (let i = 0; i < matches.length; i += TX_CHUNK) {
          const chunk = matches.slice(i, i + TX_CHUNK);
          await saveEncryptedRecords(
            write,
            chunk.map((tx) => {
              const next = { ...tx, merchantClean: trimmed };
              const { recordId, revision, ...value } = next;
              return {
                recordId,
                kind: "tx" as const,
                value: {
                  date: value.date,
                  authorizedDate: value.authorizedDate ?? null,
                  description: value.description,
                  amount: value.amount,
                  currency: value.currency,
                  accountId: value.accountId ?? null,
                  pending: Boolean(value.pending),
                  city: value.city ?? null,
                  region: value.region ?? null,
                  country: value.country ?? null,
                  merchantName: value.merchantName ?? null,
                  merchantClean: trimmed,
                  sectionName: value.sectionName ?? null,
                  categoryName: value.categoryName ?? null,
                  subcategoryName: value.subcategoryName ?? null,
                  spreadName: value.spreadName ?? null,
                  transactionTypeName: value.transactionTypeName ?? null,
                  txnCode: value.txnCode ?? null,
                  channel: value.channel ?? null,
                  statementRecordId: value.statementRecordId ?? null,
                  source: value.source ?? "statement",
                  tagNames: value.tagNames ?? [],
                },
                expectedRevision: revision,
              };
            }),
          );
        }
      }
      privateLedger.reload();
      toast.success(`Saved ${trimmed}`);
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
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:bg-accent-subtle hover:text-accent"
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
                      <li>Uploads become a small WebP avatar</li>
                      <li>Private ledger keeps that avatar encrypted</li>
                      <li>Or paste a logo URL</li>
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
                <MerchantLogoAvatar src={previewSrc} name={name} size="lg" />
                <input
                  ref={fileRef}
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    void onPickLogo(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
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
                  if (!pendingLogoDataUrl) {
                    replacePreview(next.trim() || null);
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
