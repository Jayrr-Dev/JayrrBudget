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
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

export type EditableMerchant = {
  id: string;
  name: string;
  company: string | null;
  brand: string | null;
  website: string | null;
  logoUrl: string | null;
};

type Props = {
  merchant: EditableMerchant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function EditMerchantDialog({ merchant, open, onOpenChange }: Props) {
  const update = useMutation(api.merchants.update);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [brand, setBrand] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !merchant) return;
    setName(merchant.name);
    setCompany(merchant.company ?? "");
    setBrand(merchant.brand ?? "");
    setWebsite(merchant.website ?? "");
    setLogoUrl(merchant.logoUrl ?? "");
  }, [open, merchant]);

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
        company: company.trim() || null,
        brand: brand.trim() || null,
        website: website.trim() || null,
        logoUrl: logoUrl.trim() || null,
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
                      <li>Name, company, brand, website, and logo</li>
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
            <Field label="Name" htmlFor="merchant-name">
              <Input
                id="merchant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
                disabled={busy}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company" htmlFor="merchant-company">
                <Input
                  id="merchant-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Brand" htmlFor="merchant-brand">
                <Input
                  id="merchant-brand"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  disabled={busy}
                />
              </Field>
            </div>
            <Field label="Website" htmlFor="merchant-website">
              <Input
                id="merchant-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://"
                disabled={busy}
              />
            </Field>
            <Field label="Logo URL" htmlFor="merchant-logo">
              <Input
                id="merchant-logo"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://"
                disabled={busy}
              />
            </Field>
          </div>
          <DialogFooter>
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
