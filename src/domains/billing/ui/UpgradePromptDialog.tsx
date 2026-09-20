"use client";

import { buttonVariants } from "@/components/ui/button";
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
import { UPGRADE_PROMPT_EVENT } from "@/shared/lib/upgradePromptEvents";
import { CheckoutLink } from "@convex-dev/polar/react";
import { api } from "@convex/_generated/api";
import { isUpgradeOfferText } from "@convex/lib/aiCap";
import { useConvexAuth, useQuery } from "convex/react";
import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const PREMIUM_PRICE_USD = 16;

function textFromToastPart(part: unknown) {
  if (typeof part === "string") return part;
  return "";
}

function installToastHook() {
  const originalError = toast.error.bind(toast);
  const originalWarning = toast.warning.bind(toast);

  toast.error = ((message, data) => {
    const combined = `${textFromToastPart(message)} ${textFromToastPart(data?.description)}`;
    if (isUpgradeOfferText(combined)) {
      window.dispatchEvent(
        new CustomEvent(UPGRADE_PROMPT_EVENT, { detail: combined }),
      );
    }
    return originalError(message, data);
  }) as typeof toast.error;

  toast.warning = ((message, data) => {
    const combined = `${textFromToastPart(message)} ${textFromToastPart(data?.description)}`;
    if (isUpgradeOfferText(combined)) {
      window.dispatchEvent(
        new CustomEvent(UPGRADE_PROMPT_EVENT, { detail: combined }),
      );
    }
    return originalWarning(message, data);
  }) as typeof toast.warning;
}

let toastHookInstalled = false;

export function UpgradePromptDialog() {
  const { isAuthenticated } = useConvexAuth();
  const billing = useQuery(api.polar.myBilling, isAuthenticated ? {} : "skip");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (toastHookInstalled) return;
    toastHookInstalled = true;
    installToastHook();
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const next =
        event instanceof CustomEvent && typeof event.detail === "string"
          ? event.detail
          : "";
      setDetail(next);
      setOpen(true);
    };
    window.addEventListener(UPGRADE_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(UPGRADE_PROMPT_EVENT, onPrompt);
  }, []);

  if (billing === undefined) return null;
  if (billing.role === "admin") return null;

  const canvasLocked = detail.toLowerCase().includes("premium access required");
  const alreadyPremium =
    billing.role === "premium" ||
    billing.status === "active" ||
    billing.status === "trialing";
  const showCheckout = !alreadyPremium;

  const heading = canvasLocked
    ? "Canvas is on Premium"
    : alreadyPremium
      ? "Included AI is used up"
      : "Upgrade to Premium";
  const lead = canvasLocked
    ? "Sketching the budget with Jev is included with Premium."
    : "This month's included AI is used up.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {heading}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
                  aria-label="About this upgrade"
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
                  <PopoverTitle>Premium</PopoverTitle>
                  <PopoverDescription>
                    Paid plan for more included AI and Canvas.
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>${PREMIUM_PRICE_USD} a month through Polar</li>
                    <li>Your own OpenRouter key is never billed by us</li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="sr-only">{lead}</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{lead}</p>
        <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
          {canvasLocked ? <li>Unlock Canvas chat and sketches</li> : null}
          {alreadyPremium ? (
            <>
              <li>Add your own OpenRouter key on Profile to keep going</li>
              <li>Included AI resets at the start of next month</li>
            </>
          ) : (
            <>
              <li>Canvas to sketch the budget</li>
              <li>Four times the included AI allowance</li>
              <li>Or add your own OpenRouter key and skip the cap</li>
            </>
          )}
        </ul>

        <DialogFooter className="gap-2 sm:justify-end">
          <Link
            href="/profile"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={() => setOpen(false)}
          >
            Add your own key
          </Link>
          {showCheckout ? (
            <CheckoutLink
              polarApi={api.polar}
              productIds={[billing.premiumProductId]}
              embed={false}
              lazy
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Upgrade to Premium
            </CheckoutLink>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
