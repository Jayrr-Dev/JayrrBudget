import { cn } from "cn";
import {
  budgetProgressTone,
  type BudgetProgressItem,
  type BudgetProgressTone,
} from "@/domains/budgets/domain/budgetProgress";

const TONE_FILL: Record<BudgetProgressTone, string> = {
  ok: "bg-success-subtle text-success",
  warn: "bg-warning-subtle text-warning",
  over: "bg-danger-subtle text-danger",
};

function formatPercent(percent: number) {
  if (!Number.isFinite(percent)) return "0%";
  return `${Math.round(percent)}%`;
}

export function BudgetProgressBar({
  item,
  className,
}: {
  item: BudgetProgressItem;
  className?: string;
}) {
  const percent = Math.max(0, item.percent);
  const fill = Math.min(100, percent);
  const tone = budgetProgressTone(
    percent,
    item.warningThreshold,
    item.overageThreshold,
  );
  const label = formatPercent(percent);
  const labelInFill = fill >= 18;

  return (
    <div
      className={cn("grid grid-cols-[minmax(5.5rem,8.5rem)_1fr] items-center gap-3", className)}
    >
      <p
        className="line-clamp-2 min-w-0 wrap-break-word text-sm font-medium leading-tight"
        title={item.name}
      >
        {item.name}
      </p>
      <div
        className="relative h-8 overflow-hidden rounded-full bg-surface-subtle"
        role="meter"
        aria-label={`${item.name} ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
      >
        <div
          className={cn(
            "flex h-full items-center justify-center rounded-full text-xs font-medium tabular-nums",
            TONE_FILL[tone],
          )}
          style={{ width: `${fill}%` }}
        >
          {labelInFill ? label : null}
        </div>
        {labelInFill ? null : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums text-foreground-muted">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export function BudgetProgressBars({
  items,
  className,
}: {
  items: BudgetProgressItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn("grid gap-2", className)}>
      {items.map((item) => (
        <BudgetProgressBar key={item.id} item={item} />
      ))}
    </div>
  );
}
