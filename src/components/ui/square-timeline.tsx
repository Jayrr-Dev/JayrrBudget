"use client";

import { Arrows } from "@/components/ui/arrows";
import type {
  SquareTimelineCell,
  SquareTimelineLevel,
  SquareTimelineTone,
} from "@/components/ui/square-timeline.types";
import { cn } from "cn";
import { format, isValid, parseISO } from "date-fns";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type {
  SquareTimelineCell,
  SquareTimelineLevel,
  SquareTimelineTone,
} from "@/components/ui/square-timeline.types";

const LEVEL_CLASS: Record<SquareTimelineLevel, string> = {
  0: "bg-border shadow-[inset_0_0_0_1px_rgba(46,42,37,0.08)]",
  1: "bg-evergreen-300",
  2: "bg-evergreen-400",
  3: "bg-evergreen-600",
  4: "bg-evergreen-800",
};

const TONE_CLASS: Record<SquareTimelineTone, string> = {
  empty: LEVEL_CLASS[0],
  due: "bg-accent",
  paid: "bg-evergreen-800",
  missed: "bg-destructive",
};

const LOAN_LEGEND: Array<{ tone: SquareTimelineTone; label: string }> = [
  { tone: "paid", label: "Paid" },
  { tone: "due", label: "Pay date" },
  { tone: "missed", label: "Missed" },
];

const WEEK_ROWS = 7;
const SLIDER_SCROLL_RATIO = 0.85;
const ARROW_CLASS =
  "absolute top-1/2 z-20 -translate-y-1/2 bg-surface-elevated/90 shadow-sm transition-colors hover:-translate-y-1/2 active:!-translate-y-1/2 group-hover:bg-[var(--muted)]/80 group-focus-within:bg-[var(--muted)]/80";

export const WEEKDAY_ROW_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function cellFillClass(cell: SquareTimelineCell) {
  const fill = cell.tone ? TONE_CLASS[cell.tone] : LEVEL_CLASS[cell.level];
  if (cell.faded) return cn(fill, "opacity-35");
  return fill;
}

const SIZE_VARS = {
  sm: { size: "0.625rem", gap: "2px" },
  md: { size: "0.6875rem", gap: "3px" },
  lg: { size: "0.75rem", gap: "3px" },
  xl: { size: "1rem", gap: "4px" },
} as const;

export type SquareTimelineSize = keyof typeof SIZE_VARS;

const MIN_LABEL_COLUMNS = 5;

function monthKey(iso: string | undefined) {
  if (!iso) return "";
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  const parsed = parseISO(iso);
  if (!isValid(parsed)) return "";
  return format(parsed, "yyyy-MM");
}

function monthLabel(iso: string | undefined) {
  if (!iso) return "";
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const date = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : parseISO(iso);
  if (!isValid(date)) return "";
  return format(date, "MMM yy");
}

function columnLabels(cells: SquareTimelineCell[], rows: number) {
  const colCount = Math.ceil(cells.length / rows);
  const labels: Array<{ column: number; label: string }> = [];
  let last = "";
  let lastColumn = -MIN_LABEL_COLUMNS;
  for (let column = 0; column < colCount; column += 1) {
    const cell = cells[column * rows];
    const key = monthKey(cell?.date);
    if (!key || key === last) continue;
    if (column - lastColumn < MIN_LABEL_COLUMNS) continue;
    const label = monthLabel(cell?.date);
    if (!label) continue;
    last = key;
    lastColumn = column;
    labels.push({ column, label });
  }
  return { colCount, labels };
}

function sliderEdgeMask(canLeft: boolean, canRight: boolean) {
  if (!canLeft && !canRight) return undefined;
  const start = canLeft
    ? "transparent 0, black 2.75rem"
    : "black 0, black 2.75rem";
  const end = canRight
    ? "black calc(100% - 2.75rem), transparent"
    : "black calc(100% - 2.75rem), black";
  return `linear-gradient(to right, ${start}, ${end})`;
}

function SquareTimelineBand({
  cells,
  rows,
  ariaLabel,
  showColumnLabels,
  minHeightRows,
}: {
  cells: SquareTimelineCell[];
  rows: number;
  ariaLabel?: string;
  showColumnLabels: boolean;
  minHeightRows?: number;
}) {
  const { colCount, labels } = columnLabels(cells, rows);
  const labelByColumn = new Map(
    labels.map((item) => [item.column, item.label]),
  );
  const gridMinHeight =
    minHeightRows && minHeightRows > 0
      ? `calc(${minHeightRows} * var(--st-size) + ${minHeightRows - 1} * var(--st-gap))`
      : undefined;

  return (
    <div className="w-max">
      {showColumnLabels ? (
        <div
          className="mb-1 grid"
          style={{
            gridTemplateColumns: `repeat(${colCount}, var(--st-size))`,
            columnGap: "var(--st-gap)",
          }}
          aria-hidden
        >
          {Array.from({ length: colCount }, (_, column) => (
            <span key={column} className="relative h-3.5">
              {labelByColumn.has(column) ? (
                <span className="absolute top-0 left-0 text-[10px] leading-none whitespace-nowrap text-muted-foreground">
                  {labelByColumn.get(column)}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <div
        role="img"
        aria-label={ariaLabel}
        className="grid w-max"
        style={{
          gridTemplateRows: `repeat(${rows}, var(--st-size))`,
          gridAutoFlow: "column",
          gridAutoColumns: "var(--st-size)",
          gap: "var(--st-gap)",
          minHeight: gridMinHeight,
        }}
      >
        {cells.map((cell) => (
          <span
            key={cell.id}
            title={cell.title}
            data-level={cell.level}
            data-tone={cell.tone}
            data-faded={cell.faded ? "true" : undefined}
            className={cn(
              "block size-(--st-size) rounded-xs",
              cellFillClass(cell),
            )}
          />
        ))}
      </div>
    </div>
  );
}

function WeekdayLabels({
  rows,
  labels,
  showColumnLabels,
}: {
  rows: number;
  labels: string[];
  showColumnLabels: boolean;
}) {
  return (
    <div
      className="grid shrink-0 self-end"
      style={{
        gridTemplateRows: `repeat(${rows}, var(--st-size))`,
        rowGap: "var(--st-gap)",
        marginTop: showColumnLabels ? "1.125rem" : 0,
      }}
    >
      {Array.from({ length: rows }, (_, row) => (
        <span
          key={row}
          className="text-[10px] leading-(--st-size) whitespace-nowrap text-muted-foreground"
        >
          {labels[row] ?? ""}
        </span>
      ))}
    </div>
  );
}

export function SquareTimeline({
  cells,
  rows = 7,
  size = "md",
  className,
  ariaLabel,
  showLegend = false,
  showColumnLabels = true,
  rowLabels,
  slider = false,
}: {
  cells: SquareTimelineCell[];
  rows?: number;
  size?: SquareTimelineSize;
  className?: string;
  ariaLabel?: string;
  showLegend?: boolean;
  showColumnLabels?: boolean;
  rowLabels?: string[];
  slider?: boolean;
}) {
  const vars = SIZE_VARS[size];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const bandRows = Math.min(WEEK_ROWS, rows);
  const usesLoanTones = cells.some((cell) => cell.tone != null);
  const showRowLabels = (rowLabels?.length ?? 0) > 0;

  const syncOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const pinOverlayArrow = (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * SLIDER_SCROLL_RATIO,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = el.querySelector<HTMLElement>(
      '[data-tone="due"]:not([data-faded="true"])',
    );
    if (next) {
      const nextBox = next.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      el.scrollBy({
        left: nextBox.left - view.left - view.width / 2 + nextBox.width / 2,
        behavior: "instant",
      });
    }
    syncOverflow();
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cells, syncOverflow]);

  if (cells.length === 0) return null;

  const chart = (
    <SquareTimelineBand
      cells={cells}
      rows={bandRows}
      ariaLabel={ariaLabel}
      showColumnLabels={showColumnLabels}
      minHeightRows={bandRows}
    />
  );

  return (
    <div
      className={cn("min-w-0", className)}
      style={
        {
          "--st-size": vars.size,
          "--st-gap": vars.gap,
        } as CSSProperties
      }
    >
      {slider ? (
        <div className="flex min-w-0 items-stretch gap-2">
          {showRowLabels ? (
            <WeekdayLabels
              rows={bandRows}
              labels={rowLabels ?? []}
              showColumnLabels={showColumnLabels}
            />
          ) : null}
          <div className="relative min-w-0 flex-1">
            {canLeft ? (
              <Arrows
                variant="outline"
                shape="tower"
                size="sm"
                direction="left"
                aria-label="Scroll timeline back"
                className={cn(ARROW_CLASS, "left-1")}
                onMouseDown={pinOverlayArrow}
                onClick={() => scrollByPage(-1)}
              />
            ) : null}
            {canRight ? (
              <Arrows
                variant="outline"
                shape="tower"
                size="sm"
                direction="right"
                aria-label="Scroll timeline forward"
                className={cn(ARROW_CLASS, "right-1")}
                onMouseDown={pinOverlayArrow}
                onClick={() => scrollByPage(1)}
              />
            ) : null}
            <div
              ref={scrollerRef}
              onScroll={syncOverflow}
              className="scrollbar-none overflow-x-auto overscroll-x-contain scroll-smooth pb-0.5"
              style={{
                maskImage: sliderEdgeMask(canLeft, canRight),
                WebkitMaskImage: sliderEdgeMask(canLeft, canRight),
              }}
            >
              {chart}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={syncOverflow}
          className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-0.5"
        >
          {showRowLabels ? (
            <WeekdayLabels
              rows={bandRows}
              labels={rowLabels ?? []}
              showColumnLabels={showColumnLabels}
            />
          ) : null}
          {chart}
        </div>
      )}
      {showLegend ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[10px] text-muted-foreground">
          {usesLoanTones ? (
            LOAN_LEGEND.map((item) => (
              <span key={item.tone} className="inline-flex items-center gap-1">
                <span
                  className={cn("size-2.5 rounded-xs", TONE_CLASS[item.tone])}
                />
                {item.label}
              </span>
            ))
          ) : (
            <>
              <span>Less</span>
              {([0, 1, 2, 3, 4] as SquareTimelineLevel[]).map((level) => (
                <span
                  key={level}
                  className={cn("size-2.5 rounded-xs", LEVEL_CLASS[level])}
                />
              ))}
              <span>More</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
