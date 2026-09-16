import {
  formatMoneyParts,
  type MoneyParts,
} from "@/domains/dashboard/domain/money";
import { cn } from "@/lib/utils";

function MoneyGrid({
  parts,
  className,
}: {
  parts: MoneyParts;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid w-max grid-cols-[3.5ch_1ch_10ch] items-baseline font-mono tabular-nums",
        className,
      )}
    >
      <span className="text-left">{parts.symbol}</span>
      <span className="text-center">{parts.negative ? "−" : ""}</span>
      <span className="text-right">{parts.number}</span>
    </span>
  );
}

export function MoneyText({
  amount,
  currency,
  className,
  align = "right",
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  align?: "left" | "right";
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
  return (
    <MoneyGrid
      parts={parts}
      className={cn(align === "right" ? "ml-auto" : null, className)}
    />
  );
}
