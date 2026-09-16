"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

const MIN_STEP_MS = 2600;
const SETTLE_MS = 1400;
const MS_PER_CHAR = 48;

/** Time to hold a step: room for the motion to settle plus reading time for its caption. */
export function captionMs(caption: string): number {
  return Math.max(MIN_STEP_MS, SETTLE_MS + caption.length * MS_PER_CHAR);
}

export type SceneProps = {
  /** False when the user prefers reduced motion; scenes should rest on a static step. */
  animate: boolean;
  /** Called once the scene finished its sequence so the showcase can advance. */
  onDone: () => void;
};

type SceneFrameProps = {
  step: number;
  captions: readonly string[];
  children: ReactNode;
};

/** Bordered stage + step dots + animated caption shared by every slide scene. */
export function SceneFrame({ step, captions, children }: SceneFrameProps) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6"
      aria-hidden="true"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center px-1 py-2 sm:px-2 sm:py-3">
        {children}
      </div>

      <div className="mt-3 flex h-10 shrink-0 items-start gap-2 text-sm sm:mt-4">
        <div className="flex shrink-0 gap-1 pt-1.5">
          {captions.map((_, index) => (
            <span
              key={index}
              className={
                index === step
                  ? "size-1.5 rounded-full bg-[var(--accent)]"
                  : "size-1.5 rounded-full bg-[var(--border)]"
              }
            />
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="line-clamp-2 text-[var(--foreground)]"
          >
            {captions[step]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
