"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { errorMessage } from "@/shared/lib/error-message";
import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import { api } from "@convex/_generated/api";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

export function ProfileBillingCard() {
  const { isAuthenticated } = useConvexAuth();
  const billing = useQuery(api.polar.myBilling, isAuthenticated ? {} : "skip");
  const syncProducts = useAction(api.polar.syncProducts);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  if (billing === undefined) {
    return (
      <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
        <h2 className="type-section">Billing</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
      </section>
    );
  }

  const isAdmin = billing.role === "admin";
  const isPremium = billing.role === "premium";
  const showPortal =
    isPremium || billing.status === "active" || billing.status === "trialing";

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
      <h2 className="type-section flex items-center gap-2">
        Billing
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About billing"
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
              <PopoverTitle>Billing</PopoverTitle>
              <PopoverDescription>
                Polar handles checkout and the customer portal.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Premium unlocks Canvas and a higher AI cap</li>
                <li>Admin accounts are not billed</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>

      <p className="text-sm text-[var(--muted-foreground)]">
        {isAdmin
          ? "Admin is not billed."
          : billing.productName
            ? `${billing.productName}${billing.status ? ` (${billing.status})` : ""}.`
            : "Free plan. Upgrade for Canvas and a higher AI cap."}
      </p>

      {isAdmin ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={() => {
            setSyncError(null);
            setSyncing(true);
            void syncProducts({})
              .then(() => setSyncing(false))
              .catch((err: unknown) => {
                setSyncError(
                  errorMessage(err, "Could not sync Polar products."),
                );
                setSyncing(false);
              });
          }}
        >
          {syncing ? "Syncing…" : "Sync Polar products"}
        </Button>
      ) : null}

      {isAdmin ? null : showPortal ? (
        <CustomerPortalLink
          polarApi={api.polar}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          returnUrl={window.location.href}
        >
          Manage subscription
        </CustomerPortalLink>
      ) : (
        <CheckoutLink
          polarApi={api.polar}
          productIds={[billing.premiumProductId]}
          embed={false}
          lazy
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          Upgrade to Premium
        </CheckoutLink>
      )}

      {syncError ? (
        <p className="text-sm text-danger" role="alert">
          {syncError}
        </p>
      ) : null}
    </section>
  );
}
