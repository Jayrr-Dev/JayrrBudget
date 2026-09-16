import {
  formatMoneyParts,
  type MoneyParts,
} from "@/domains/dashboard/domain/money";
import { cn } from "@/lib/utils";

function MoneyGrid({
  parts,
  className,
  signMark,
}: {
  parts: MoneyParts;
  className?: string;
  signMark?: "minus" | "plus" | "auto";
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
      className={cn(
        "inline-grid w-full min-w-0 grid-cols-[max-content_max-content_minmax(0,1fr)] items-baseline gap-x-1.5 font-mono tabular-nums",
        className,
      )}
    >
      <span className="min-w-max text-left">{parts.symbol}</span>
      <span className="w-[1ch] text-center">{mark}</span>
      <span className="min-w-[7ch] text-right">{parts.number}</span>
    </span>
  );
}

export function MoneyText({
  amount,
  currency,
  className,
  align = "right",
  signMark = "auto",
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  align?: "left" | "right";
  signMark?: "minus" | "plus" | "auto";
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
      signMark={signMark}
      className={cn(align === "right" ? "ml-auto" : null, className)}
    />
  );
}
