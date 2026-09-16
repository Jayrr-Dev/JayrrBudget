"use client";

import { Landmark, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const CAPTIONS = [
  "Add your mortgage, car, or student loan. Snap the paperwork instead of retyping it.",
  "See how much of each payment shrinks the loan and how close you are to done.",
  "Want AI to look at your budget? It only sees numbers once you flip this on.",
] as const;
const DURATIONS = CAPTIONS.map(captionMs);

const PRINCIPAL_PCT = 62;
const INTEREST_PCT = 38;

export function LoansAiScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone);
  const cloudOn = step >= 2;

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      <div className="flex h-full flex-col justify-center space-y-3">
        {/* Loan card */}
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--foreground)]">
              <Landmark className="size-3.5 shrink-0 text-[var(--accent)]" />
              <span className="truncate">Mortgage · 25 yr · 4.9%</span>
            </span>
            <span className="shrink-0 font-mono text-[var(--muted-foreground)]">$1,842 / mo</span>
          </div>

          {/* Payment split bar */}
          <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
            <motion.div
              className="h-full bg-[var(--accent)]"
              initial={animate ? { width: "0%" } : false}
              animate={{ width: step >= 1 ? `${PRINCIPAL_PCT}%` : "100%" }}
              transition={{ type: "spring", stiffness: 90, damping: 20 }}
            />
            <motion.div
              className="h-full bg-[var(--spend)]/70"
              initial={false}
              animate={{ width: step >= 1 ? `${INTEREST_PCT}%` : "0%" }}
              transition={{ type: "spring", stiffness: 90, damping: 20 }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-[var(--muted-foreground)]">
            <motion.span animate={{ opacity: step >= 1 ? 1 : 0 }}>
              Principal {PRINCIPAL_PCT}%
            </motion.span>
            <motion.span animate={{ opacity: step >= 1 ? 1 : 0 }}>
              Interest {INTEREST_PCT}%
            </motion.span>
          </div>
        </div>

        {/* Cloud Processing toggle */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[var(--foreground)]">
            <Sparkles
              className={
                cloudOn
                  ? "size-3.5 shrink-0 text-[var(--accent)]"
                  : "size-3.5 shrink-0 text-[var(--muted-foreground)]"
              }
            />
            <span className="min-w-0">
              Cloud Processing
              <span className="hidden text-[var(--muted-foreground)] sm:inline">
                {" "}
                · Canvas AI, OCR
              </span>
            </span>
          </span>
          <motion.button
            type="button"
            tabIndex={-1}
            className="relative h-5 w-9 rounded-full"
            animate={{ backgroundColor: cloudOn ? "var(--accent)" : "var(--border)" }}
            transition={{ duration: 0.3 }}
          >
            <motion.span
              className="absolute top-0.5 size-4 rounded-full bg-white shadow"
              animate={{ left: cloudOn ? "1.125rem" : "0.125rem" }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            />
          </motion.button>
        </div>
      </div>
    </SceneFrame>
  );
}
