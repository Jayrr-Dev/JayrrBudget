import {
  formatMoneyParts,
  type MoneyParts,
} from "@/domains/dashboard/domain/money";
import { signTone, type MoneyTone } from "@/domains/dashboard/domain/moneyTone";
import { cn } from "@/lib/utils";

export type { MoneyTone } from "@/domains/dashboard/domain/moneyTone";

const TONE_CLASS: Record<MoneyTone, string> = {
  gain: "text-[var(--income)]",
  cost: "text-[var(--spend)]",
  neutral: "text-[var(--foreground)]",
};

export function moneyToneClass(tone: MoneyTone) {
  return TONE_CLASS[tone];
}

function MoneyGrid({
  parts,
  className,
  align = "right",
  tone,
}: {
  parts: MoneyParts;
  className?: string;
  align?: "left" | "right";
  tone: MoneyTone;
}) {
  return (
    <span
      data-slot="money-grid"
      className={cn(
        "inline-grid items-baseline gap-x-1.5 font-mono font-normal",
        align === "right"
          ? "w-full min-w-max grid-cols-[max-content_minmax(7ch,1fr)]"
          : "w-auto grid-cols-[max-content_max-content]",
        moneyToneClass(tone),
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
  tone,
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  align?: "left" | "right";
  /** When false, omit currency code/symbol (compact table cells). */
  showSymbol?: boolean;
  /** Equity effect. Defaults to ledger sign (money in = gain, money out = cost). */
  tone?: MoneyTone;
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
  const resolvedTone = tone ?? signTone(amount);
  if (!showSymbol) {
    return (
      <span
        className={cn(
          "block font-mono font-normal whitespace-nowrap",
          align === "left" ? "text-left" : "text-right",
          moneyToneClass(resolvedTone),
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
      tone={resolvedTone}
      className={cn(align === "right" ? "ml-auto" : null, className)}
    />
  );
}
