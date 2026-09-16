"use client";

import { Camera, FileText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const CAPTIONS = [
  "Drop in a pile of statements. The ones you already did get flagged before anything doubles.",
  "It reads every line for you. Tell it once that ACME payroll is income and it remembers.",
  "Clean rows land in your ledger. The hour you used to spend typing is yours again.",
] as const;
const DURATIONS = CAPTIONS.map(captionMs);

const FILES = [
  { icon: FileText, name: "chequing-aug.pdf" },
  { icon: Camera, name: "visa-photo.jpg" },
  { icon: FileText, name: "savings-aug.pdf" },
] as const;

const ROWS = [
  { date: "Aug 03", merchant: "Loblaws", amount: "-$86.40" },
  { date: "Aug 04", merchant: "ACME payroll", amount: "+$2,150.00" },
  { date: "Aug 06", merchant: "Netflix", amount: "-$16.99" },
] as const;

export function StatementImportScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone);

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      <div className="grid h-full grid-cols-[5rem_1fr] items-center gap-4 sm:grid-cols-[6.5rem_1fr] sm:gap-6">
        {/* File stack with scan beam */}
        <div className="relative mx-auto h-20 w-[4.5rem] sm:h-24 sm:w-24">
          {FILES.map(({ icon: Icon, name }, index) => (
            <motion.div
              key={name}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm"
              initial={animate ? { opacity: 0, y: 16, rotate: 0 } : false}
              animate={{
                opacity: 1,
                y: index * -3,
                rotate: (index - 1) * (step >= 1 ? 0 : 6),
              }}
              transition={{ delay: index * 0.15, duration: 0.4 }}
              style={{ zIndex: index }}
            >
              <Icon className="size-6 text-[var(--muted-foreground)]" />
              <span className="max-w-16 truncate px-1 font-mono text-[10px] text-[var(--muted-foreground)] sm:max-w-20">
                {name}
              </span>
            </motion.div>
          ))}
          {step === 1 && animate ? (
            <motion.div
              className="absolute inset-x-1 z-10 h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]"
              initial={{ top: "8%" }}
              animate={{ top: ["8%", "88%", "8%"] }}
              transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}
            />
          ) : null}
          {step === 0 ? <DuplicateBadge /> : null}
        </div>

        {/* Ledger rows */}
        <div className="min-w-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-[3.2rem_1fr_auto] gap-2 border-b border-[var(--border)] px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <span>Date</span>
            <span>Merchant</span>
            <span>Amount</span>
          </div>
          <AnimatePresence initial={false}>
            {step >= 2 ? (
              ROWS.map((row, index) => (
                <motion.div
                  key={row.merchant}
                  initial={animate ? { opacity: 0, x: -12 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.2, duration: 0.3 }}
                  className="grid grid-cols-[3.2rem_1fr_auto] gap-2 px-2.5 py-1.5 text-xs"
                >
                  <span className="text-[var(--muted-foreground)]">{row.date}</span>
                  <span className="truncate text-[var(--foreground)]">{row.merchant}</span>
                  <span
                    className={
                      row.amount.startsWith("+")
                        ? "font-mono text-[var(--income)]"
                        : "font-mono text-[var(--foreground)]"
                    }
                  >
                    {row.amount}
                  </span>
                </motion.div>
              ))
            ) : (
              <motion.div
                key="placeholder"
                exit={{ opacity: 0 }}
                className="space-y-2 px-2.5 py-2.5"
              >
                {ROWS.map((row) => (
                  <div key={row.merchant} className="h-3 rounded bg-[var(--muted)]" />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SceneFrame>
  );
}

/** "Already imported" marker shown on the stack while files are being staged. */
function DuplicateBadge() {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.9 }}
      className="absolute -right-2 -top-2 z-10 rounded-full bg-[var(--spend)] px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
    >
      1 duplicate
    </motion.span>
  );
}
