"use client";

import type {
  SquareTimelineCell,
  SquareTimelineLevel,
  SquareTimelineTone,
} from "@/components/ui/square-timeline.types";
import { cn } from "cn";
import { format, isValid, parseISO } from "date-fns";
import { useEffect, useRef, useState, type CSSProperties } from "react";

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

function cssLengthToPx(length: string) {
  const value = parseFloat(length);
  if (!Number.isFinite(value)) return 0;
  if (length.endsWith("rem") && typeof document !== "undefined") {
    const root = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    return value * (Number.isFinite(root) ? root : 16);
  }
  return value;
}

function wrapColumnCount(
  widthPx: number,
  sizePx: number,
  gapPx: number,
  cellCount: number,
  minRows: number,
) {
  const colsFit = Math.max(1, Math.floor((widthPx + gapPx) / (sizePx + gapPx)));
  const colsForMinRows = Math.max(1, Math.ceil(cellCount / minRows));
  return Math.min(colsFit, colsForMinRows);
}

function cellBands(cells: SquareTimelineCell[], columns: number, rows: number) {
  const perBand = Math.max(1, columns * rows);
  const bands: SquareTimelineCell[][] = [];
  for (let index = 0; index < cells.length; index += perBand) {
    bands.push(cells.slice(index, index + perBand));
  }
  return bands;
}

function SquareTimelineBand({
  cells,
  rows,
  ariaLabel,
  showColumnLabels,
  rowLabels,
  minHeightRows,
}: {
  cells: SquareTimelineCell[];
  rows: number;
  ariaLabel?: string;
  showColumnLabels: boolean;
  rowLabels?: string[];
  minHeightRows?: number;
}) {
  const { colCount, labels } = columnLabels(cells, rows);
  const labelByColumn = new Map(
    labels.map((item) => [item.column, item.label]),
  );
  const showRowLabels = (rowLabels?.length ?? 0) > 0;
  const gridMinHeight =
    minHeightRows && minHeightRows > 0
      ? `calc(${minHeightRows} * var(--st-size) + ${minHeightRows - 1} * var(--st-gap))`
      : undefined;

  return (
    <div className="flex min-w-0 gap-2">
      {showRowLabels ? (
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
              {rowLabels?.[row] ?? ""}
            </span>
          ))}
        </div>
      ) : null}
      <div className="min-w-0">
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
  wrap = false,
}: {
  cells: SquareTimelineCell[];
  rows?: number;
  size?: SquareTimelineSize;
  className?: string;
  ariaLabel?: string;
  showLegend?: boolean;
  showColumnLabels?: boolean;
  rowLabels?: string[];
  wrap?: boolean;
}) {
  const vars = SIZE_VARS[size];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapColumns, setWrapColumns] = useState<number | null>(null);
  const bandRows = Math.min(WEEK_ROWS, wrap ? WEEK_ROWS : rows);
  const usesLoanTones = cells.some((cell) => cell.tone != null);

  useEffect(() => {
    if (!wrap) return;
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => {
      if (el.clientWidth <= 0) return;
      const sizePx = cssLengthToPx(vars.size);
      const gapPx = cssLengthToPx(vars.gap);
      const labelGutter = rowLabels && rowLabels.length > 0 ? 28 : 0;
      setWrapColumns(
        wrapColumnCount(
          el.clientWidth - labelGutter,
          sizePx,
          gapPx,
          cells.length,
          bandRows,
        ),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bandRows, cells.length, rowLabels, vars.gap, vars.size, wrap]);

  if (cells.length === 0) return null;

  const columnsForMinRows = Math.max(1, Math.ceil(cells.length / bandRows));
  const columns = wrapColumns ?? columnsForMinRows;
  const bands = wrap ? cellBands(cells, columns, bandRows) : [cells];

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
      <div
        ref={wrapRef}
        className={
          wrap
            ? "flex min-w-0 flex-col gap-3"
            : "flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-0.5"
        }
      >
        {bands.map((band, bandIndex) => (
          <SquareTimelineBand
            key={band[0]?.id ?? bandIndex}
            cells={band}
            rows={bandRows}
            ariaLabel={bandIndex === 0 ? ariaLabel : undefined}
            showColumnLabels={showColumnLabels}
            rowLabels={rowLabels}
            minHeightRows={wrap ? bandRows : undefined}
          />
        ))}
      </div>
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
