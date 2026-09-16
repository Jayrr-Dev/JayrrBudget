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
  const isLeft = align === "left";
  return (
    <span
      className={cn(
        "inline-grid items-baseline gap-x-1 font-mono tabular-nums",
        isLeft
          ? parts.negative
            ? "w-max grid-cols-[auto_auto_auto]"
            : "w-max grid-cols-[auto_auto]"
          : "w-full grid-cols-[3.5ch_1ch_minmax(0,1fr)]",
        className,
      )}
    >
      <span className={isLeft ? "text-left" : "text-right"}>
        {parts.symbol}
      </span>
      {isLeft ? (
        parts.negative ? (
          <span>−</span>
        ) : null
      ) : (
        <span className="text-center">{parts.negative ? "−" : ""}</span>
      )}
      <span className={cn("min-w-0", isLeft ? "text-left" : "text-right")}>
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
