"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PiggyMascot,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/shared/lib/error-message";
import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import { api } from "@convex/_generated/api";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Gauge,
  Info,
  Lock,
  type LucideIcon,
  PenTool,
  Sparkles,
  Wallet,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type PlanLimits = {
  monthlyCapUsd: number | null;
  rateMax: number;
  includedCanvas: boolean;
};

type PerkRow = {
  id: string;
  icon: LucideIcon;
  label: string;
  free: string;
  premium: string;
  /** True when Free has none of it; Free renders a lock instead of a value. */
  gated: boolean;
  caption: string;
  mood: PiggyMood;
};

const STEP_MS = 3200;
const ROW_STAGGER_S = 0.08;
const IDLE_CAPTION = "Ready when you are. Premium is one tap away.";

function moneyLabel(amount: number) {
  if (Number.isInteger(amount)) return `$${amount}`;
  return `$${amount.toFixed(2)}`;
}

function capValue(amount: number | null) {
  return amount == null ? "No cap" : `${moneyLabel(amount)} / mo`;
}

function perkRows(free: PlanLimits, premium: PlanLimits): PerkRow[] {
  const rows: PerkRow[] = [];
  if (premium.includedCanvas) {
    rows.push({
      id: "canvas",
      icon: PenTool,
      label: "Canvas",
      free: free.includedCanvas ? "Included" : "Locked",
      premium: "Included",
      gated: !free.includedCanvas,
      caption: "Sketch budgets and ask Piggy about them on a shared board.",
      mood: "excited",
    });
  }
  rows.push({
    id: "ai-cap",
    icon: Wallet,
    label: "Included AI",
    free: capValue(free.monthlyCapUsd),
    premium: capValue(premium.monthlyCapUsd),
    gated: false,
    caption:
      premium.monthlyCapUsd == null
        ? "No monthly AI cap on the app key."
        : "More Piggy answers every month before the app key pauses.",
    mood: "happy",
  });
  rows.push({
    id: "rate",
    icon: Gauge,
    label: "AI requests",
    free: `${free.rateMax} / min`,
    premium: `${premium.rateMax} / min`,
    gated: false,
    caption: "Ask faster. Piggy keeps up when you are on a roll.",
    mood: "love",
  });
  return rows;
}

/** Loops through `count` steps, then a rest step, forever. Frozen when disabled. */
function useLoopStep(count: number, enabled: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!enabled || count === 0) return;
    const id = window.setTimeout(() => {
      setStep((current) => (current + 1) % (count + 1));
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [count, enabled, step]);
  return enabled ? step : count;
}

export function ProfileBillingCard() {
  const { isAuthenticated } = useConvexAuth();
  const billing = useQuery(api.polar.myBilling, isAuthenticated ? {} : "skip");
  const catalog = useQuery(
    api.service.planCatalog,
    isAuthenticated ? {} : "skip",
  );
  const syncProducts = useAction(api.polar.syncProducts);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;

  const rows = catalog == null ? [] : perkRows(catalog.free, catalog.premium);
  const isAdmin = billing?.role === "admin";
  const isPremium = billing?.role === "premium";
  const showPortal =
    isPremium || billing?.status === "active" || billing?.status === "trialing";
  const runScene = billing !== undefined && !isAdmin && !showPortal;
  const step = useLoopStep(rows.length, animate && runScene);

  if (billing === undefined) {
    return (
      <section className="space-y-4 rounded-xl border border-border bg-surface-elevated p-6">
        <h2 className="type-section">Billing</h2>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const premiumPrice =
    catalog == null ? null : moneyLabel(catalog.premium.priceUsd);
  const currentName = isAdmin
    ? "Admin"
    : (billing.productName ?? catalog?.premium.name ?? "Premium");
  const currentPriceLabel = isAdmin
    ? "Not billed"
    : showPortal
      ? premiumPrice
        ? `${premiumPrice} / month`
        : "Monthly"
      : `${moneyLabel(catalog?.free.priceUsd ?? 0)} / month`;
  const planTitle = isAdmin
    ? "You're on Admin"
    : showPortal
      ? `You're on ${currentName}`
      : `You're on ${catalog?.free.name ?? "Free"}`;

  const activeRow = runScene ? rows[step] : undefined;
  const mood: PiggyMood = isAdmin
    ? "love"
    : showPortal
      ? "love"
      : (activeRow?.mood ?? "happy");
  const caption = isAdmin
    ? "Full access, no Polar charge."
    : showPortal
      ? "Thanks for going Premium. Piggy is all yours."
      : (activeRow?.caption ?? IDLE_CAPTION);

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
                <li>Premium is billed monthly. Cancel in the portal.</li>
                <li>
                  Included AI is the app-key cap. Your own OpenRouter key is not
                  capped.
                </li>
                <li>Admin accounts are not billed.</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>

      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {planTitle}
          <Badge variant="outline" className="h-5">
            Current
          </Badge>
        </p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {currentPriceLabel}
        </p>
      </div>

      <motion.div
        className="rounded-xl p-px"
        style={{
          backgroundImage:
            "linear-gradient(120deg, var(--primary), var(--accent), var(--primary))",
          backgroundSize: "200% 200%",
        }}
        animate={
          animate
            ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }
            : undefined
        }
        transition={{ duration: 8, ease: "linear", repeat: Infinity }}
      >
        <div className="rounded-[calc(var(--radius-xl)-1px)] bg-surface-elevated p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <motion.div
              className="shrink-0"
              animate={animate ? { y: [0, -4, 0] } : undefined}
              transition={{
                duration: 2.4,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mood}
                  initial={animate ? { opacity: 0, scale: 0.85 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={animate ? { opacity: 0, scale: 0.85 } : undefined}
                  transition={{ duration: 0.25 }}
                >
                  <PiggyMascot mood={mood} iconClassName="size-16 sm:size-20" />
                </motion.div>
              </AnimatePresence>
            </motion.div>

            <div className="min-w-0 flex-1 space-y-1">
              <Badge className="gap-1.5">
                <Sparkles />
                {isAdmin ? "Admin" : showPortal ? "Premium" : "Premium unlocks"}
              </Badge>
              <div className="min-h-10">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={caption}
                    initial={animate ? { opacity: 0, y: 6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={animate ? { opacity: 0, y: -6 } : undefined}
                    transition={{ duration: 0.25 }}
                    className="text-sm leading-snug text-foreground"
                  >
                    {caption}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {isAdmin ? null : rows.length > 0 ? (
            <ul className="mt-4 space-y-1">
              {rows.map((row, index) => {
                const Icon = row.icon;
                const active = runScene && step === index;
                const unlocked = showPortal || !runScene || step >= index;
                return (
                  <motion.li
                    key={row.id}
                    initial={animate ? { opacity: 0, x: -8 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * ROW_STAGGER_S,
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-300",
                      active && "bg-primary-subtle",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors duration-300",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {row.label}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {showPortal ? null : (
                        <>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            {row.gated ? (
                              <Lock className="size-3.5" aria-hidden />
                            ) : null}
                            {row.free}
                          </span>
                          <ArrowRight
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </>
                      )}
                      <motion.span
                        key={unlocked ? "on" : "off"}
                        initial={animate ? { scale: 0.8, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 24,
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 font-semibold",
                          unlocked ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        <Check className="size-3.5" aria-hidden />
                        {row.premium}
                      </motion.span>
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          )}

          {runScene ? (
            <div className="mt-3 flex justify-center gap-1" role="presentation">
              {[...rows, null].map((_, index) => (
                <motion.span
                  key={index}
                  className="block h-1.5 rounded-full"
                  animate={{
                    width: index === step ? 16 : 6,
                    backgroundColor:
                      index === step ? "var(--primary)" : "var(--border)",
                  }}
                  transition={{ duration: 0.25 }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>

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
        <div className="flex flex-wrap items-center gap-3">
          <motion.div
            whileHover={animate ? { y: -2, scale: 1.02 } : undefined}
            whileTap={animate ? { scale: 0.98 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <CheckoutLink
              polarApi={api.polar}
              productIds={[billing.premiumProductId]}
              embed={false}
              lazy
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "gap-1.5 shadow-md shadow-primary/25",
              )}
            >
              <Sparkles className="size-3.5" aria-hidden />
              Get Premium
            </CheckoutLink>
          </motion.div>
          {premiumPrice ? (
            <p className="text-sm text-muted-foreground">
              {premiumPrice} / month
            </p>
          ) : null}
        </div>
      )}

      {syncError ? (
        <p className="text-sm text-danger" role="alert">
          {syncError}
        </p>
      ) : null}
    </section>
  );
}
