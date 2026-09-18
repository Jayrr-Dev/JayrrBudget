"use client";

import {
  formatMoneyParts,
  type MoneyParts,
} from "@/domains/dashboard/domain/money";
import { resolveBankDirection } from "@/domains/transactions/domain/debitCredit";
import { cn } from "@/lib/utils";
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Credit = income green; debit = spend tone. Color carries the sign. */
export function flowMoneyProps(txn: {
  amount: number;
  bankDirection?: string | null;
}): {
  className: string | undefined;
} {
  const flow = resolveBankDirection(txn);
  if (flow === "credit") {
    return { className: "text-[var(--income)]" };
  }
  if (flow === "debit") {
    return { className: "text-[var(--spend)]" };
  }
  return { className: undefined };
}

function signToneClass(negative: boolean) {
  return negative ? "text-[var(--income)]" : "text-[var(--spend)]";
}

function MoneyGrid({
  parts,
  className,
  align = "right",
  fit = false,
}: {
  parts: MoneyParts;
  className?: string;
  align?: "left" | "right";
  fit?: boolean;
}) {
  return (
    <span
      data-slot="money-grid"
      style={
        fit
          ? { fontSize: "var(--money-fit-size, 0.875rem)" }
          : undefined
      }
      className={cn(
        "font-mono font-normal",
        fit
          ? "block w-full min-w-0 overflow-hidden whitespace-nowrap text-right"
          : "inline-grid items-baseline gap-x-1.5",
        fit
          ? null
          : align === "right"
            ? "w-full min-w-max grid-cols-[max-content_minmax(7ch,1fr)]"
            : "w-auto grid-cols-[max-content_max-content]",
        signToneClass(parts.negative),
        className,
      )}
    >
      {fit ? (
        <>
          {parts.symbol}
          {"\u00a0"}
          {parts.number}
        </>
      ) : (
        <>
          <span className="text-left">{parts.symbol}</span>
          <span
            className={cn(
              "whitespace-nowrap",
              align === "right" ? "text-right" : "text-left",
            )}
          >
            {parts.number}
          </span>
        </>
      )}
    </span>
  );
}

const FIT_MONEY_MIN_PX = 8;
const FIT_MONEY_MAX_PX = 14;

/** Shared font size for money cells in a fluid table: shrink until every amount fits. */
export function FitMoneyScale({
  children,
  className,
  contentKey,
  minPx = FIT_MONEY_MIN_PX,
  maxPx = FIT_MONEY_MAX_PX,
}: {
  children: ReactNode;
  className?: string;
  contentKey?: string;
  minPx?: number;
  maxPx?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const fit = () => {
      root.style.setProperty("--money-fit-size", `${maxPx}px`);
      const cells = root.querySelectorAll<HTMLElement>("[data-slot=money-grid]");
      let ratio = 1;
      cells.forEach((cell) => {
        const width = cell.clientWidth;
        const needed = cell.scrollWidth;
        if (width > 0 && needed > width) {
          ratio = Math.min(ratio, width / needed);
        }
      });
      const next = Math.max(minPx, Math.min(maxPx, maxPx * ratio));
      root.style.setProperty("--money-fit-size", `${next}px`);
    };

    const observer = new ResizeObserver(fit);
    observer.observe(root);
    const frame = requestAnimationFrame(() => {
      fit();
      requestAnimationFrame(fit);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.style.removeProperty("--money-fit-size");
    };
  }, [contentKey, maxPx, minPx]);

  const style = {
    ["--money-fit-size" as string]: `${maxPx}px`,
  } satisfies CSSProperties;

  return (
    <div ref={rootRef} className={className} style={style}>
      {children}
    </div>
  );
}

export function MoneyText({
  amount,
  currency,
  className,
  align = "right",
  showSymbol = true,
  fit = false,
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  align?: "left" | "right";
  /** When false, omit currency code/symbol (compact table cells). */
  showSymbol?: boolean;
  /** Fill a fluid cell; pair with FitMoneyScale so type size tracks table width. */
  fit?: boolean;
}) {
  const parts = formatMoneyParts(amount, currency);
  if (!parts) {
    return (
      <span
        className={cn(
          "block",
          align === "left" ? "text-left" : "text-right",
          className,
        )}
      >
        -
      </span>
    );
  }
  if (!showSymbol) {
    return (
      <span
        className={cn(
          "block font-mono font-normal",
          align === "left" ? "text-left" : "text-right",
          signToneClass(parts.negative),
          className,
        )}
      >
        {parts.number}
      </span>
    );
  }
  return (
    <MoneyGrid
      parts={parts}
      align={align}
      fit={fit}
      className={cn(align === "right" ? "ml-auto" : null, className)}
    />
  );
}
