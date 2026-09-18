import { BUDGET_CYCLE_LABELS } from "@/domains/budgets/domain/budgetCycle";
import {
  budgetProgressTone,
  type BudgetProgressItem,
  type BudgetProgressTone,
} from "@/domains/budgets/domain/budgetProgress";
import { formatCompactDisplayDate } from "@/shared/lib/format-date";
import { cn } from "cn";

const RING_SIZE = 112;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TONE_RING: Record<BudgetProgressTone, string> = {
  ok: "text-sky-400",
  warn: "text-warning",
  over: "text-danger",
};

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function remainingRatio(item: BudgetProgressItem) {
  if (!(item.amount > 0)) return item.remaining > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, item.remaining / item.amount));
}

function BudgetProgressCard({ item }: { item: BudgetProgressItem }) {
  const percent = Math.max(0, item.percent);
  const tone = budgetProgressTone(
    percent,
    item.warningThreshold,
    item.overageThreshold,
  );
  const fill = remainingRatio(item);
  const dash = fill * RING_CIRCUMFERENCE;
  const remainingLabel = money.format(item.remaining);
  const lookup = item.lookup ?? "—";

  return (
    <article
      className="flex min-h-56 flex-col rounded-2xl border border-border bg-surface-elevated px-4 py-3.5"
      aria-label={`${item.name} ${remainingLabel} remaining`}
    >
      <header className="min-w-0">
        <h2
          className="truncate text-sm font-semibold tracking-wide uppercase"
          title={item.name}
        >
          {item.name}
        </h2>
        <p className="truncate text-xs text-foreground-muted" title={lookup}>
          {lookup}
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center py-3">
        <div
          className="relative"
          style={{ width: RING_SIZE, height: RING_SIZE }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, percent))}
          aria-label={`${item.name} ${Math.round(percent)}% used`}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
            aria-hidden
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              className="stroke-surface-subtle"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              className={cn("stroke-current", TONE_RING[tone])}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
            />
          </svg>
          <p className="absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums">
            {remainingLabel}
          </p>
        </div>
      </div>
      <footer className="flex items-end justify-between gap-2 text-xs text-foreground-muted">
        <span className="tabular-nums">
          {formatCompactDisplayDate(item.periodStart)}
        </span>
        <span>{BUDGET_CYCLE_LABELS[item.cycle]}</span>
      </footer>
    </article>
  );
}

export function BudgetProgressCards({
  items,
  className,
}: {
  items: BudgetProgressItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3",
        className,
      )}
    >
      {items.map((item) => (
        <BudgetProgressCard key={item.id} item={item} />
      ))}
    </div>
  );
}
