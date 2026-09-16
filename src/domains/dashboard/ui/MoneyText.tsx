import {
  formatMoneyParts,
  type MoneyParts,
} from "@/domains/dashboard/domain/money";
import { cn } from "@/lib/utils";

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
      className={cn(
        "inline-grid items-baseline gap-x-1 font-mono tabular-nums",
        align === "left"
          ? "w-max grid-cols-[3.5ch_1ch_auto]"
          : "w-full grid-cols-[3.5ch_1ch_minmax(0,1fr)]",
        className,
      )}
    >
      <span className="text-right">{parts.symbol}</span>
      <span className="text-center">{parts.negative ? "−" : ""}</span>
      <span className="min-w-0 text-right">{parts.number}</span>
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
  return <MoneyGrid parts={parts} className={className} align={align} />;
}
