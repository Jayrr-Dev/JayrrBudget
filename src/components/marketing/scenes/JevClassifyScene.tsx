"use client";

import { Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const CAPTIONS = [
  "New rows land with no labels. Jev is already on it.",
  "Every row gets its bucket in seconds, filed the way you would file it.",
  "Jev learns how you sort, so labels land right the first time.",
  "No more fixing labels every week. Your ledger just stays tidy.",
] as const;
const DURATIONS = CAPTIONS.map(captionMs);

const ROWS = [
  {
    date: "Aug 03",
    merchant: "Loblaws",
    amount: "-$86.40",
    label: "Groceries",
  },
  {
    date: "Aug 04",
    merchant: "ACME payroll",
    amount: "+$2,150.00",
    label: "Income",
  },
  {
    date: "Aug 06",
    merchant: "Netflix",
    amount: "-$16.99",
    label: "Streaming",
  },
  {
    date: "Aug 09",
    merchant: "Pilot Coffee",
    amount: "-$42.10",
    label: "Coffee shops",
  },
] as const;

const STATUS: Record<number, string | null> = {
  0: null,
  1: null,
  2: `${ROWS.length} of ${ROWS.length} right`,
  3: "Nothing to fix",
};

export function JevClassifyScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone);
  const labeled = step >= 1;
  const verified = step >= 2;
  const status = STATUS[step] ?? null;

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      <div className="flex h-full flex-col justify-center gap-3">
        {/* Jev at work + running status */}
        <div className="flex items-center justify-between gap-2">
          <motion.span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            animate={{
              borderColor: step === 1 ? "var(--accent)" : "var(--border)",
              backgroundColor: step === 1 ? "var(--accent)" : "var(--surface)",
              color:
                step === 1 ? "var(--accent-foreground)" : "var(--foreground)",
              scale: step === 1 && animate ? [1, 1.05, 1] : 1,
            }}
            transition={{
              duration: 0.35,
              scale:
                step === 1 && animate
                  ? { duration: 1.2, repeat: Infinity }
                  : undefined,
            }}
          >
            <Sparkles className="size-3" />
            {step === 1 ? "Jev is sorting…" : "Jev"}
          </motion.span>

          <AnimatePresence mode="wait" initial={false}>
            {status ? (
              <motion.span
                key={status}
                initial={{ opacity: 0, scale: 0.8, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -4 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--income)] px-2.5 py-1 text-xs font-medium text-white shadow-sm"
              >
                <Check className="size-3" />
                {status}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Ledger rows with the label column filling in */}
        <div className="min-w-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-[3.2rem_1fr_auto_5.5rem] gap-2 border-b border-[var(--border)] px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] sm:grid-cols-[3.2rem_1fr_auto_6.5rem]">
            <span>Date</span>
            <span>Merchant</span>
            <span>Amount</span>
            <span>Label</span>
          </div>
          {ROWS.map((row, index) => (
            <motion.div
              key={row.merchant}
              initial={animate ? { opacity: 0, x: -12 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15, duration: 0.3 }}
              className="grid grid-cols-[3.2rem_1fr_auto_5.5rem] items-center gap-2 px-2.5 py-1.5 text-xs sm:grid-cols-[3.2rem_1fr_auto_6.5rem]"
            >
              <span className="text-[var(--muted-foreground)]">{row.date}</span>
              <span className="truncate text-[var(--foreground)]">
                {row.merchant}
              </span>
              <span
                className={
                  row.amount.startsWith("+")
                    ? "font-mono text-[var(--income)]"
                    : "font-mono text-[var(--foreground)]"
                }
              >
                {row.amount}
              </span>
              <div className="flex min-w-0 items-center gap-1">
                <AnimatePresence mode="wait" initial={false}>
                  {labeled ? (
                    <motion.span
                      key="label"
                      initial={
                        animate ? { opacity: 0, scale: 0.6, y: 4 } : false
                      }
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 16,
                        delay: animate ? index * 0.18 : 0,
                      }}
                      className="min-w-0 truncate rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-foreground)]"
                    >
                      {row.label}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="placeholder"
                      exit={{ opacity: 0 }}
                      className="h-3 w-14 rounded-full border border-dashed border-[var(--border)]"
                    />
                  )}
                </AnimatePresence>
                <motion.span
                  initial={false}
                  animate={
                    verified
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.4 }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 18,
                    delay: verified && animate ? index * 0.12 : 0,
                  }}
                  className="shrink-0 text-[var(--income)]"
                >
                  <Check className="size-3.5" />
                </motion.span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </SceneFrame>
  );
}
