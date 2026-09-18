import {
  formatMoneyParts,
  type MoneyParts,
} from "@/domains/dashboard/domain/money";
import { resolveBankDirection } from "@/domains/transactions/domain/debitCredit";
import { cn } from "@/lib/utils";

/** Credit = income green; debit = spend tone. Color carries the sign. */
export function flowMoneyProps(txn: {
  amount: number;
  bankDirection?: string | null;
}): {
  signMark: "plus" | "auto";
  className: string | undefined;
} {
  const flow = resolveBankDirection(txn);
  if (flow === "credit") {
    return {
      signMark: "auto",
      className: "text-[var(--income)]",
    };
  }
  if (flow === "debit") {
    return {
      signMark: "auto",
      className: "text-[var(--spend)]",
    };
  }
  return { signMark: "auto", className: undefined };
}

function MoneyGrid({
  parts,
  className,
  signMark,
  align = "right",
}: {
  parts: MoneyParts;
  className?: string;
  signMark?: "minus" | "plus" | "auto";
  align?: "left" | "right";
}) {
  const mark =
    signMark === "plus"
      ? "+"
      : signMark === "minus"
        ? "−"
        : parts.negative
          ? "−"
          : "";
  return (
    <span
      data-slot="money-grid"
      className={cn(
        "inline-grid min-w-0 items-baseline gap-x-1.5 font-mono tabular-nums",
        align === "right"
          ? "w-full grid-cols-[max-content_max-content_minmax(0,1fr)]"
          : "w-auto grid-cols-[max-content_max-content_max-content]",
        className,
      )}
    >
      <span className="min-w-max text-left">{parts.symbol}</span>
      <span className="w-[1ch] text-center">{mark}</span>
      <span
        className={align === "right" ? "min-w-[7ch] text-right" : "text-left"}
      >
        {parts.number}
      </span>
    </span>
  );
}

export function MoneyText({
  amount,
  currency,
  className,
  align = "right",
  signMark = "auto",
  showSymbol = true,
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  align?: "left" | "right";
  signMark?: "minus" | "plus" | "auto";
  /** When false, omit currency code/symbol (compact table cells). */
  showSymbol?: boolean;
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
    const mark =
      signMark === "plus"
        ? "+"
        : signMark === "minus"
          ? "−"
          : parts.negative
            ? "−"
            : "";
    return (
      <span
        className={cn(
          "block font-mono tabular-nums",
          align === "left" ? "text-left" : "text-right",
          className,
        )}
      >
        {mark}
        {parts.number}
      </span>
    );
  }
  return (
    <MoneyGrid
      parts={parts}
      signMark={signMark}
      align={align}
      className={cn(align === "right" ? "ml-auto" : null, className)}
    />
  );
}
