"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SquareTimeline,
  WEEKDAY_ROW_LABELS,
  type SquareTimelineSize,
} from "@/components/ui/square-timeline";
import type { DashboardLoanSummary } from "@/domains/dashboard/domain/types";
import { loanPaymentTimelineCells } from "@/domains/loans/domain/loanPaymentTimeline";
import { Info } from "lucide-react";
import { useMemo } from "react";

export function LoanPaymentTimeline({
  loan,
  compact = false,
  size = compact ? "xl" : "lg",
  showColumnLabels = true,
  className,
}: {
  loan: DashboardLoanSummary;
  compact?: boolean;
  size?: SquareTimelineSize;
  showColumnLabels?: boolean;
  className?: string;
}) {
  const cells = useMemo(() => loanPaymentTimelineCells(loan), [loan]);
  if (cells.length === 0) return null;

  const ariaLabel = `${loan.paymentsApplied} of ${loan.paymentCount} payments`;

  if (compact) {
    return (
      <SquareTimeline
        cells={cells}
        size={size}
        rows={7}
        slider
        rowLabels={WEEKDAY_ROW_LABELS}
        ariaLabel={ariaLabel}
        showColumnLabels={showColumnLabels}
        className={className}
      />
    );
  }

  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
        Payment timeline
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
              aria-label="About payment timeline"
            >
              <Info className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-80 gap-0 p-3.5"
          >
            <PopoverHeader className="gap-1.5">
              <PopoverTitle>Payment timeline</PopoverTitle>
              <PopoverDescription>
                Each square is one calendar day in the loan term, in weeks of
                seven days.
              </PopoverDescription>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>The bright pink square is the next pay date</li>
                <li>Later pay dates stay faded pink</li>
                <li>Dark green on light green is a posted payment</li>
                <li>Dark red on light red is a missed pay date</li>
                <li>Days leading up to a payment take its green or red</li>
                <li>That color continues through today</li>
                <li>The dark blue mark is today</li>
                <li>Days after today stay plain</li>
                <li>A payment counts if it posts the day before or after</li>
              </ul>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated px-4 py-4">
        <SquareTimeline
          cells={cells}
          size={size}
          rows={7}
          slider
          rowLabels={WEEKDAY_ROW_LABELS}
          ariaLabel={ariaLabel}
          showLegend
        />
      </div>
    </section>
  );
}
