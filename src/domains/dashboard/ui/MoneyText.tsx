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
}: {
  parts: MoneyParts;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <span
      data-slot="money-grid"
      className={cn(
        "inline-grid items-baseline gap-x-1.5 font-mono font-normal",
        align === "right"
          ? "w-full min-w-max grid-cols-[max-content_minmax(7ch,1fr)]"
          : "w-auto grid-cols-[max-content_max-content]",
        signToneClass(parts.negative),
        className,
      )}
    >
      <span className="text-left">{parts.symbol}</span>
      <span
        className={cn(
          "whitespace-nowrap",
          align === "right" ? "text-right" : "text-left",
        )}
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
  showSymbol = true,
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  align?: "left" | "right";
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
    return (
      <span
        className={cn(
          "block font-mono font-normal whitespace-nowrap",
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
      className={cn(align === "right" ? "ml-auto" : null, className)}
    />
  );
}
