"use client";

import { cn } from "@/lib/utils";
import { PiggyMascot, type PiggyMood } from "@/domains/ledger-ai/ui/PiggyMascot";
import styles from "./PiggyPageStatus.module.css";

export function PiggyPageStatus({
  mood = "thinking",
  label = "Thinking",
  showDots = true,
  className,
  iconClassName,
}: {
  mood?: PiggyMood;
  label?: string;
  showDots?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(styles.wrap, className)}
      role="status"
      aria-live="polite"
      aria-label={showDots ? `${label}…` : label}
    >
      <PiggyMascot mood={mood} iconClassName={cn("size-16", iconClassName)} />
      <p className={styles.label}>
        {label}
        {showDots ? <span className={styles.dots} /> : null}
      </p>
    </div>
  );
}

export function PiggyThinkingPage({ className }: { className?: string }) {
  return (
    <div
      data-slot="piggy-thinking-page"
      className={cn(
        "flex min-h-64 w-full items-center justify-center py-16",
        className,
      )}
    >
      <PiggyPageStatus />
    </div>
  );
}
