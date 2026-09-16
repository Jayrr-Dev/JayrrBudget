"use client";

import { motion } from "motion/react";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const CAPTIONS = [
  "Did you come out ahead this month? One look at the bars and you know.",
  "See which bucket or merchant is taking the biggest bite.",
  "Spot the wild months next to the calm ones before the wild ones become normal.",
] as const;
const DURATIONS = CAPTIONS.map(captionMs);

const VIEWS = ["Summary", "Sections", "High Mid Low"] as const;

/** Bar heights in percent. Step 0: spend vs income pairs. Step 1+: section totals. */
const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;
const SPEND = [58, 72, 64, 90, 55, 68] as const;
const INCOME = [80, 80, 82, 80, 85, 80] as const;

const SECTIONS = [
  { label: "Food", value: 78 },
  { label: "Lifestyle", value: 52 },
  { label: "Travel", value: 88 },
  { label: "Dev", value: 30 },
  { label: "Home", value: 64 },
  { label: "Other", value: 22 },
] as const;

const RANGE = { high: 88, mid: 58, low: 22 } as const;

export function AnalysisScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone);
  const grouped = step === 0;
  const labels = grouped ? MONTHS : SECTIONS.map((s) => s.label);

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      {/* View tabs, mirroring the Analysis screen */}
      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map((view, index) => (
          <span
            key={view}
            className={
              index === step
                ? "rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-foreground)]"
                : "rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]"
            }
          >
            {view}
          </span>
        ))}
      </div>

      <div className="relative h-24">
        {/* High / mid / low guide lines */}
        {(Object.entries(RANGE) as [keyof typeof RANGE, number][]).map(([key, value]) => (
          <motion.div
            key={key}
            className="absolute inset-x-0 flex items-center gap-1"
            style={{ bottom: `${value}%` }}
            initial={false}
            animate={{ opacity: step === 2 ? 1 : 0 }}
            transition={{ duration: 0.35 }}
          >
            <span className="w-7 text-right text-[9px] uppercase text-[var(--muted-foreground)]">
              {key}
            </span>
            <span className="h-px flex-1 border-t border-dashed border-[var(--muted-foreground)]/60" />
          </motion.div>
        ))}

        <div className="absolute inset-y-0 left-8 right-0 grid grid-cols-6 items-end gap-2">
          {labels.map((label, index) => (
            <div key={label} className="flex h-full items-end justify-center gap-0.5">
              <motion.div
                className="w-full max-w-4 rounded-t-sm bg-[var(--accent)]"
                initial={animate ? { height: "0%" } : false}
                animate={{
                  height: `${grouped ? SPEND[index] : SECTIONS[index].value}%`,
                  opacity: step === 2 && SECTIONS[index].value < RANGE.mid ? 0.45 : 1,
                }}
                transition={{ delay: index * 0.06, type: "spring", stiffness: 140, damping: 18 }}
              />
              <motion.div
                className="w-full max-w-4 rounded-t-sm bg-[var(--muted-foreground)]/50"
                initial={false}
                animate={{
                  height: grouped ? `${INCOME[index]}%` : "0%",
                  width: grouped ? "100%" : "0%",
                  opacity: grouped ? 1 : 0,
                }}
                transition={{ delay: index * 0.06, type: "spring", stiffness: 140, damping: 18 }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-6 gap-2 pl-8">
        {labels.map((label) => (
          <span
            key={label}
            className="truncate text-center text-[10px] text-[var(--muted-foreground)]"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-2 flex gap-3 text-[10px] text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-[var(--accent)]" />
          Spending
        </span>
        <motion.span
          className="inline-flex items-center gap-1"
          animate={{ opacity: grouped ? 1 : 0.3 }}
        >
          <span className="size-2 rounded-sm bg-[var(--muted-foreground)]/50" />
          Income
        </motion.span>
      </div>
    </SceneFrame>
  );
}
