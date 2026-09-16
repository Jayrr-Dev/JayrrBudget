"use client";

import { ChevronRight, Tag } from "lucide-react";
import { motion } from "motion/react";
import { captionMs, SceneFrame, type SceneProps } from "./SceneFrame";
import { useStepper } from "./useStepper";

const CAPTIONS = [
  "That $42 coffee run has to go somewhere. Once it has a bucket, you can see it add up.",
  "Section is the big picture. Category is where the money really went.",
  "Subcategory is where the forgotten $9 a month subscription finally shows itself.",
  "Tag the whole trip in one click and find out what New York actually cost you.",
] as const;
const DURATIONS = CAPTIONS.map(captionMs);

const LEVELS = [
  { kind: "Section", value: "Food", showAt: 1 },
  { kind: "Category", value: "Dining", showAt: 1 },
  { kind: "Subcategory", value: "Coffee shops", showAt: 2 },
] as const;

export function ClassificationScene({ animate, onDone }: SceneProps) {
  const step = useStepper(DURATIONS, animate, onDone);

  return (
    <SceneFrame step={step} captions={CAPTIONS}>
      <div className="flex h-full flex-col items-start justify-center gap-3">
        {/* The transaction being filed */}
        <div className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
          <span className="min-w-0 truncate text-[var(--foreground)]">
            Aug 09 · Pilot Coffee Roasters
          </span>
          <span className="shrink-0 font-mono text-[var(--foreground)]">-$42.10</span>
        </div>

        {/* Breadcrumb path lighting up level by level */}
        <div className="flex w-full flex-wrap items-center gap-1.5">
          {LEVELS.map(({ kind, value, showAt }, index) => {
            const on = step >= showAt;
            return (
              <div key={kind} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <ChevronRight
                    className={
                      on
                        ? "size-3.5 text-[var(--accent)]"
                        : "size-3.5 text-[var(--border)]"
                    }
                  />
                ) : null}
                <motion.div
                  className="flex flex-col rounded-md border px-2.5 py-1.5"
                  animate={{
                    borderColor: on ? "var(--accent)" : "var(--border)",
                    backgroundColor: on ? "var(--surface)" : "var(--muted)",
                    opacity: on ? 1 : 0.6,
                  }}
                  transition={{ duration: 0.35, delay: on && animate ? index * 0.12 : 0 }}
                >
                  <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    {kind}
                  </span>
                  <span
                    className={
                      on
                        ? "text-xs font-medium text-[var(--foreground)]"
                        : "text-xs font-medium text-[var(--muted-foreground)]"
                    }
                  >
                    {on ? value : "—"}
                  </span>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Tag sticker slaps on last */}
        <motion.span
          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-foreground)] shadow-sm"
          initial={false}
          animate={
            step >= 3
              ? { opacity: 1, scale: 1, rotate: -3 }
              : { opacity: 0, scale: 0.6, rotate: 12 }
          }
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <Tag className="size-3" />
          New York 2026 · Aug 07 – Aug 12
        </motion.span>
      </div>
    </SceneFrame>
  );
}
