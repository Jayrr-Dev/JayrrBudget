"use client";

import { Arrows } from "@/components/ui/arrows";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyPrompt } from "@/components/ui/empty-prompt";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastCompact } from "@/components/ui/sonner";
import { PageSpinner } from "@/components/ui/spinner";
import {
  ScrollTopX,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ANALYSIS_PERIOD_META,
  ANALYSIS_PERIOD_OPTIONS,
  parseAnalysisPeriod,
} from "@/domains/analysis/domain/periods";
import type {
  AnalysisCategoryBreakdown,
  AnalysisCategorySeries,
  AnalysisData,
  AnalysisIncomeSourceBreakdown,
  AnalysisMerchantBreakdown,
  AnalysisPeriod,
  AnalysisRange,
  AnalysisRankedItem,
  AnalysisStackedRankedBreakdown,
  AnalysisSubcategoryBreakdown,
  AnalysisTagBreakdown,
  AnalysisTxnPeek,
  AnalysisTypeBreakdown,
} from "@/domains/analysis/domain/types";
import { useAnalysis } from "@/domains/analysis/queries/useAnalysisQuery";
import {
  readAnalysisUiPrefs,
  writeAnalysisUiPrefs,
  type AnalysisTab,
  type FacetPane,
} from "@/domains/analysis/ui/analysisUiPrefs";
import {
  formatMoney,
  formatMoneyParts,
} from "@/domains/dashboard/domain/money";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { MerchantLabel } from "@/domains/merchants/ui/MerchantLabel";
import { keepTxnPeekPopoverOpen } from "@/domains/merchants/ui/MerchantTxnsPopover";
import { MoveMerchantDialog } from "@/domains/merchants/ui/MoveMerchantDialog";
import { useScratchNoteActions } from "@/domains/scratch-note/scratchNoteStore";
import {
  DescriptionActionsButton,
  EditDescriptionDialog,
} from "@/domains/transactions/ui/EditDescriptionDialog";
import { DecryptingPage } from "@/domains/vault/ui/DecryptingStatus";
import { useHoverPointer, useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/shared/lib/csv";
import {
  formatDisplayDate,
  formatShortDisplayDate,
} from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import { taxonomyDescription } from "@convex/lib/taxonomyDescriptions";
import { IconInfoCircle } from "@tabler/icons-react";
import { useQuery } from "convex/react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  Treemap,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from "recharts";

const RANGE_OPTIONS: {
  value: AnalysisRange;
  label: string;
  desktopLabel?: string;
}[] = [
  { value: "1w", label: "1W", desktopLabel: "Week" },
  { value: "1m", label: "1M", desktopLabel: "Month" },
  { value: "3m", label: "3M", desktopLabel: "3 Months" },
  { value: "6m", label: "6M", desktopLabel: "6 Month" },
  { value: "12m", label: "1Y", desktopLabel: "Year" },
  { value: "all", label: "All" },
];

const TAB_OPTIONS: { value: AnalysisTab; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "sections", label: "Sections" },
  { value: "categories", label: "Categories" },
  { value: "subcategories", label: "Subcategories" },
  { value: "tags", label: "Tags" },
  { value: "types", label: "Code" },
  { value: "spreads", label: "Spreads" },
  { value: "merchants", label: "Merchants" },
  { value: "income", label: "Income" },
  { value: "patterns", label: "Patterns" },
];

function isMerchantNameLabel(label: string) {
  return /merchant/i.test(label);
}

const FACET_PANE_OPTIONS: { value: FacetPane; label: string }[] = [
  { value: "visualizations", label: "Visualizations" },
  { value: "summary", label: "Summary" },
  { value: "average", label: "Average" },
  { value: "range", label: "High Mid Low" },
];

const TREND_CONFIG = {
  spend: {
    label: "Spending",
    color: "oklch(0.55 0.12 35)",
  },
  income: {
    label: "Income",
    color: "oklch(0.52 0.1 155)",
  },
  transfers: {
    label: "Internal transfers",
    color: "oklch(0.62 0.02 250)",
  },
} satisfies ChartConfig;

const TREND_SERIES: AnalysisCategorySeries[] = [
  { key: "spend", label: "Spending" },
  { key: "income", label: "Income" },
  { key: "transfers", label: "Transfers" },
];

const TREND_LEGEND_COLORS = [
  TREND_CONFIG.spend.color,
  TREND_CONFIG.income.color,
  TREND_CONFIG.transfers.color,
];

/** Light fills with enough chroma for readable stacked bands + dark callouts. */
const CATEGORY_COLORS = [
  "oklch(0.78 0.16 35)",
  "oklch(0.76 0.14 220)",
  "oklch(0.77 0.14 155)",
  "oklch(0.8 0.15 85)",
  "oklch(0.76 0.13 300)",
  "oklch(0.77 0.13 20)",
  "oklch(0.74 0.08 250)",
];

type BreakdownView = "bar" | "pie" | "area";

const BREAKDOWN_VIEW_OPTIONS: { value: BreakdownView; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "pie", label: "Pie" },
  { value: "area", label: "Area" },
];

/** Distance between cursor/active point and the tooltip card (Recharts default is 10). */
const CHART_TOOLTIP_OFFSET = 28;

/** Keep the card inside the chart; Recharts flips left/up when it would overflow. */
const CHART_TOOLTIP_ESCAPE = { x: false, y: false } as const;

function moneyTick(value: number, currency: string) {
  const parts = formatMoneyParts(value, currency, true);
  if (!parts) return "-";
  const sign = parts.negative ? "-" : "";
  return `${parts.symbol} ${sign}${parts.number}`;
}

function InfoTip({ label, children }: { label: string; children: string }) {
  const hover = useHoverPointer();
  const isMobile = useIsMobile();
  const trigger = (
    <button
      type="button"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-accent hover:text-primary sm:size-6"
      aria-label={label}
    >
      <IconInfoCircle className="size-3.5 sm:size-4" />
    </button>
  );

  if (isMobile) {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="leading-snug">
              {children}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  if (hover) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-xs text-left leading-snug"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
      >
        <PopoverDescription className="leading-snug">
          {children}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

function Stat({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-2.5 py-2 sm:rounded-xl sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
        <p className="type-kicker line-clamp-2 text-[0.65rem] leading-tight tracking-wide sm:text-sm sm:leading-normal">
          {label}
        </p>
        {info ? <InfoTip label={`${label} info`}>{info}</InfoTip> : null}
      </div>
      <p className="type-stat mt-0.5 text-[0.95rem] sm:mt-1 sm:text-lg">
        {value}
      </p>
    </div>
  );
}

function csvFilenameFromTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "export";
}

function ChartTitle({
  title,
  info,
  actions,
  csv,
}: {
  title: string;
  info: string;
  actions?: ReactNode;
  /** When set, shows Export CSV on the far right of the header. */
  csv?: { headers: string[]; rows: unknown[][]; filename?: string };
}) {
  const exportButton = csv ? (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="hidden h-auto py-1 md:inline-flex"
      disabled={csv.rows.length === 0}
      onClick={() => {
        downloadCsv(
          csv.filename ?? csvFilenameFromTitle(title),
          toCsv(csv.headers, csv.rows),
        );
        toastCompact.success(
          csv.rows.length === 1
            ? "Exported 1 row"
            : `Exported ${csv.rows.length} rows`,
        );
      }}
    >
      Export CSV
    </Button>
  ) : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-center gap-1">
        <h2 className="type-section">{title}</h2>
        <InfoTip label={`${title} info`}>{info}</InfoTip>
      </div>
      {actions || exportButton ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
          {exportButton}
        </div>
      ) : null}
    </div>
  );
}

type MixScale = "standard" | "relative";

const MIX_SCALE_OPTIONS: { value: MixScale; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "relative", label: "Relative" },
];

function PeriodViews({
  value,
  onChange,
}: {
  value: AnalysisPeriod;
  onChange: (value: AnalysisPeriod) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="Time series view"
      options={ANALYSIS_PERIOD_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}

function ScaleViews({
  value,
  onChange,
}: {
  value: MixScale;
  onChange: (value: MixScale) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="Chart scale"
      options={MIX_SCALE_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}

function ChartActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {children}
    </div>
  );
}

function toRelativeRows(
  rows: Array<Record<string, string | number>>,
  keys: string[],
) {
  return rows.map((row) => {
    const total = keys.reduce(
      (sum, key) => sum + Math.max(0, Number(row[key] ?? 0)),
      0,
    );
    const next: Record<string, string | number> = {
      month: row.month,
      label: row.label,
    };
    for (const key of keys) {
      const value = Math.max(0, Number(row[key] ?? 0));
      next[key] = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
    }
    return next;
  });
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPiePercent(percent: number) {
  const share = percent * 100;
  if (share >= 10) return `${Math.round(share)}%`;
  return `${share.toFixed(1)}%`;
}

const PIE_LABEL_RADIAN = Math.PI / 180;
const PIE_LABEL_INK = "#171717";
/** Outside callouts (below this share go unlabeled; at/above use in-slice text). */
const PIE_OUTSIDE_MIN_SHARE = 0.015;
const PIE_INSIDE_MIN_SHARE = 0.08;
const PIE_CALLOUT_BOX_H = 24;
const PIE_CALLOUT_MIN_GAP = 26;
const PIE_PADDING_ANGLE = 1.5;

type PieCalloutSide = "left" | "right";

/** Names that get outside callouts, grouped by side and sorted top → bottom. */
function pieCalloutColumns(
  pieRows: Array<{ name: string; spend: number }>,
  pieTotal: number,
): Record<PieCalloutSide, string[]> {
  const left: { name: string; sin: number }[] = [];
  const right: { name: string; sin: number }[] = [];
  if (pieTotal <= 0) return { left: [], right: [] };

  const n = pieRows.length;
  const dataAngle = Math.max(0, 360 - n * PIE_PADDING_ANGLE);
  let angleCursor = 0;

  for (let i = 0; i < n; i++) {
    const row = pieRows[i];
    if (!row) continue;
    const share = Number(row.spend) / pieTotal;
    const sliceAngle = dataAngle * share;
    const midAngle = angleCursor + sliceAngle / 2;
    angleCursor += sliceAngle + PIE_PADDING_ANGLE;

    if (share < PIE_OUTSIDE_MIN_SHARE || share >= PIE_INSIDE_MIN_SHARE) {
      continue;
    }

    const rad = -midAngle * PIE_LABEL_RADIAN;
    const entry = { name: String(row.name), sin: Math.sin(rad) };
    if (Math.cos(rad) >= 0) right.push(entry);
    else left.push(entry);
  }

  const byTop = (a: { sin: number }, b: { sin: number }) => a.sin - b.sin;
  return {
    left: left.sort(byTop).map((entry) => entry.name),
    right: right.sort(byTop).map((entry) => entry.name),
  };
}

function pieColumnY(
  index: number,
  count: number,
  cy: number,
  outerRadius: number,
) {
  const minY = PIE_CALLOUT_BOX_H / 2 + 4;
  const maxY = Math.max(minY, 2 * cy - minY);
  if (count <= 1) {
    return Math.min(maxY, Math.max(minY, cy));
  }
  const needed = (count - 1) * PIE_CALLOUT_MIN_GAP;
  const span = Math.min(needed, maxY - minY);
  const start = cy - span / 2;
  return start + (index * span) / (count - 1);
}

function PieCenterTotal({
  viewBox,
  total,
  currency,
}: {
  viewBox?: { cx?: number; cy?: number };
  total: number;
  currency: string;
}) {
  const cx = viewBox?.cx;
  const cy = viewBox?.cy;
  if (cx == null || cy == null) return null;

  return (
    <text textAnchor="middle" dominantBaseline="central">
      <tspan
        x={cx}
        y={cy - 14}
        fill="var(--muted-foreground)"
        className="type-caption"
      >
        Total
      </tspan>
      <tspan
        x={cx}
        y={cy + 10}
        fill="color-mix(in oklch, var(--foreground) 62%, var(--muted-foreground))"
        className="type-stat"
      >
        {formatMoney(total, currency)}
      </tspan>
    </text>
  );
}

function PieDonutLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
  name = "",
  index = 0,
  fill,
  columns,
}: PieLabelRenderProps & {
  columns: Record<PieCalloutSide, string[]>;
}) {
  const share = Number(percent);
  if (!Number.isFinite(share) || share < PIE_OUTSIDE_MIN_SHARE) return null;

  const rad = -Number(midAngle) * PIE_LABEL_RADIAN;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sliceName = String(name);
  const label = formatPiePercent(share);
  const inside = share >= PIE_INSIDE_MIN_SHARE;
  const showNameInside = sliceName.length > 0 && share >= 0.12;
  const sliceColor =
    typeof fill === "string" && fill.length > 0
      ? fill
      : CATEGORY_COLORS[Number(index) % CATEGORY_COLORS.length];

  if (inside) {
    const x =
      Number(cx) + ((Number(innerRadius) + Number(outerRadius)) / 2) * cos;
    const y =
      Number(cy) + ((Number(innerRadius) + Number(outerRadius)) / 2) * sin;
    if (!showNameInside) {
      return (
        <text
          x={x}
          y={y}
          fill={PIE_LABEL_INK}
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          className="text-sm font-semibold"
        >
          {label}
        </text>
      );
    }
    return (
      <g pointerEvents="none">
        <text
          x={x}
          y={y - 8}
          fill={PIE_LABEL_INK}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-sm font-semibold"
        >
          {label}
        </text>
        <text
          x={x}
          y={y + 10}
          fill={PIE_LABEL_INK}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-sm"
        >
          {sliceName}
        </text>
      </g>
    );
  }

  const side: PieCalloutSide = cos >= 0 ? "right" : "left";
  const names = columns[side];
  const columnIndex = Math.max(0, names.indexOf(sliceName));
  const rimX = Number(cx) + Number(outerRadius) * cos;
  const rimY = Number(cy) + Number(outerRadius) * sin;
  const elbowX =
    Number(cx) + (Number(outerRadius) + 14) * (side === "right" ? 1 : -1);
  const labelY = pieColumnY(
    columnIndex,
    names.length,
    Number(cy),
    Number(outerRadius),
  );
  const calloutLabel = sliceName.length > 0 ? `${sliceName} ${label}` : label;
  const boxW = calloutBoxWidth(calloutLabel);
  const boxX = side === "right" ? elbowX + 6 : elbowX - 6 - boxW;

  return (
    <g pointerEvents="none">
      <polyline
        points={`${rimX},${rimY} ${elbowX},${labelY} ${
          side === "right" ? boxX : boxX + boxW
        },${labelY}`}
        fill="none"
        stroke="#111"
        strokeWidth={1}
      />
      <circle cx={rimX} cy={rimY} r={2.25} fill="#111" />
      <foreignObject
        x={boxX}
        y={labelY - PIE_CALLOUT_BOX_H / 2}
        width={boxW}
        height={PIE_CALLOUT_BOX_H}
      >
        <div className="flex h-full min-w-0 items-center gap-1 rounded-md bg-background/80 px-1.5 text-sm leading-none font-medium whitespace-nowrap text-[#111]">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px] border border-black/15"
            style={{ backgroundColor: sliceColor }}
          />
          <span className="min-w-0 overflow-hidden text-ellipsis">
            {calloutLabel}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

const TREEMAP_LABEL_BASE_PX = 14;
const TREEMAP_LABEL_MAX_PX = 28;

/** Floor at text-sm; grow with the shorter tile side so big blocks read larger. */
function treemapLabelFontPx(width: number, height: number) {
  const minSide = Math.min(width, height);
  const t = Math.max(0, Math.min(1, (minSide - 100) / 220));
  return Math.round(
    TREEMAP_LABEL_BASE_PX + t * (TREEMAP_LABEL_MAX_PX - TREEMAP_LABEL_BASE_PX),
  );
}

/** Squarified area blocks for breakdown "Area" view (treemap). */
function AreaTreemapCell({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  value,
  index = 0,
  depth,
  currency,
  total,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string | number;
  value?: number;
  index?: number;
  depth?: number;
  currency: string;
  total: number;
}) {
  if (depth !== 1 || width < 2 || height < 2) return null;

  const fill = CATEGORY_COLORS[Number(index) % CATEGORY_COLORS.length];
  const label = String(name ?? "");
  const spend = Number(value ?? 0);
  const share = total > 0 ? spend / total : 0;
  const showValue = width >= 56 && height >= 32;
  const showName = width >= 72 && height >= 48;
  const showPct = width >= 88 && height >= 68 && share > 0;
  const fontPx = treemapLabelFontPx(width, height);
  const maxChars = Math.max(4, Math.floor((width - 12) / (fontPx * 0.55)));
  const displayName =
    label.length > maxChars
      ? `${label.slice(0, Math.max(3, maxChars - 1))}…`
      : label;
  const lineStyle = {
    fontSize: `${fontPx}px`,
    lineHeight: 1.15,
  } as const;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="var(--background)"
        strokeWidth={2}
      />
      {showValue || showName || showPct ? (
        <foreignObject
          x={x + 6}
          y={y + 4}
          width={Math.max(0, width - 10)}
          height={Math.max(0, height - 8)}
          pointerEvents="none"
        >
          <div
            className="box-border flex h-full w-full flex-col overflow-hidden text-left text-black"
            style={{ color: "#111", WebkitTextFillColor: "#111" }}
          >
            {showValue ? (
              <div className="font-semibold" style={lineStyle}>
                {moneyTick(spend, currency)}
              </div>
            ) : null}
            {showName ? (
              <div className="truncate" style={lineStyle}>
                {displayName}
              </div>
            ) : null}
            {showPct ? (
              <div className="font-normal opacity-70" style={lineStyle}>
                {formatPiePercent(share)}
              </div>
            ) : null}
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}

function activeVisibleKeys(allKeys: string[], current: string[]) {
  const active = current.filter((item) => allKeys.includes(item));
  return active.length > 0 ? active : allKeys;
}

function nextVisibleKeys(allKeys: string[], current: string[], key: string) {
  const selected = activeVisibleKeys(allKeys, current);
  if (selected.length === allKeys.length) return [key];
  if (selected.includes(key)) {
    const next = selected.filter((item) => item !== key);
    return next.length > 0 ? next : allKeys;
  }
  return allKeys.filter((item) => selected.includes(item) || item === key);
}

function nextVisibleKeySet(
  allKeys: string[],
  current: string[],
  next: string[],
) {
  if (next.length === 0) return allKeys;
  const selected = activeVisibleKeys(allKeys, current);
  if (
    selected.length === allKeys.length &&
    next.length === allKeys.length - 1
  ) {
    const isolated = allKeys.find((key) => !next.includes(key));
    return isolated ? [isolated] : next;
  }
  return next;
}

function TimeSeriesTable({
  rows,
  columns,
  currency,
  visibleKeys,
  onVisibleKeysChange,
  valueKind = "money",
}: {
  rows: Array<Record<string, string | number>>;
  columns: { key: string; label: string }[];
  currency: string;
  visibleKeys?: string[];
  onVisibleKeysChange?: (keys: string[]) => void;
  valueKind?: "money" | "percent";
}) {
  const columnSeries = useMemo(
    () => columns.map((column) => ({ key: column.key, label: column.label })),
    [columns],
  );
  const internal = useVisibleSeries(columnSeries);
  const allKeys = columns.map((column) => column.key);
  const keys = visibleKeys ?? internal.visibleKeys;
  const setKeys = onVisibleKeysChange ?? internal.setVisibleKeys;
  const filterable = columns.length > 1;
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const totals = useMemo(() => {
    const next: Record<string, number> = {};
    for (const column of columns) {
      next[column.key] = rows.reduce(
        (sum, row) => sum + Number(row[column.key] ?? 0),
        0,
      );
    }
    return next;
  }, [columns, rows]);

  if (rows.length === 0) return null;
  return (
    <ScrollArea
      type="always"
      className="h-56 overflow-hidden rounded-lg border border-border sm:h-72 [&>[data-slot=scroll-area-viewport]>div]:block!"
    >
      <Table
        variant="lined"
        containerClassName="overflow-visible [transform:none]"
        className={cn(
          "border-separate! border-spacing-0 [transform:none] text-[0.7rem] sm:text-sm",
          "[&_th]:h-8 [&_th]:px-1.5 [&_th]:py-1 sm:[&_th]:h-10 sm:[&_th]:px-2 sm:[&_th]:py-0",
          "[&_td]:px-1.5 [&_td]:py-1 sm:[&_td]:p-2",
          "[&_thead_th]:border-t-0 [&_tbody_tr:first-child_td]:border-t-0",
        )}
      >
        <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-surface-elevated [&_th]:shadow-[inset_0_-1px_0_var(--border)]">
          <TableRow>
            <TableHead className="min-w-[4.25rem] font-mono">Period</TableHead>
            {columns.map((column) => {
              const on = !filterable || keys.includes(column.key);
              return (
                <TableHead
                  key={column.key}
                  className="max-w-[5.25rem] text-right whitespace-nowrap sm:max-w-none"
                >
                  {filterable ? (
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Toggle ${column.label}`}
                      onClick={() =>
                        setKeys(nextVisibleKeys(allKeys, keys, column.key))
                      }
                      className={cn(
                        "w-full rounded-sm text-right font-medium leading-tight hover:bg-muted",
                        !on && "opacity-40 line-through",
                      )}
                    >
                      {column.label}
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {newestFirst.map((row) => (
            <TableRow key={String(row.month ?? row.label)}>
              <TableCell className="whitespace-nowrap font-mono font-medium">
                {String(row.label ?? "")}
              </TableCell>
              {columns.map((column) => {
                const on = !filterable || keys.includes(column.key);
                return (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "text-right font-mono text-[0.7rem] tabular-nums sm:text-sm",
                      !on && "opacity-40",
                    )}
                  >
                    {valueKind === "percent" ? (
                      formatPercent(Number(row[column.key] ?? 0))
                    ) : (
                      <MoneyText
                        amount={Number(row[column.key] ?? 0)}
                        currency={currency}
                        className="text-[0.7rem] sm:text-sm"
                      />
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="border-t-0 bg-muted [&_td]:sticky [&_td]:bottom-0 [&_td]:z-20 [&_td]:border-b-0 [&_td]:bg-muted [&_td]:text-muted-foreground [&_td]:shadow-[inset_0_1px_0_var(--border)]">
          <TableRow>
            <TableCell className="font-mono">Total</TableCell>
            {columns.map((column) => {
              const on = !filterable || keys.includes(column.key);
              const total = totals[column.key] ?? 0;
              return (
                <TableCell
                  key={column.key}
                  className={cn(
                    "text-right font-mono text-[0.7rem] tabular-nums sm:text-sm",
                    !on && "opacity-40",
                  )}
                >
                  {valueKind === "percent" ? (
                    formatPercent(rows.length > 0 ? total / rows.length : 0)
                  ) : (
                    <MoneyText
                      amount={total}
                      currency={currency}
                      className="text-[0.7rem] sm:text-sm"
                    />
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableFooter>
      </Table>
    </ScrollArea>
  );
}

function EmptyState() {
  return (
    <EmptyPrompt
      title="No transactions in this range"
      description="Import statements, then spending trends show up here."
      href="/statements"
      actionLabel="Upload statement"
    />
  );
}

function TrendChart({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const { visibleKeys, setVisibleKeys } = useVisibleSeries(TREND_SERIES);
  const visibleKeySet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const [scale, setScale] = useState<MixScale>("standard");
  const isRelative = scale === "relative";
  const chartRows = useMemo(
    () =>
      isRelative ? toRelativeRows(data.monthly, visibleKeys) : data.monthly,
    [data.monthly, isRelative, visibleKeys],
  );

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title="Spending vs income"
        info="Lifestyle outflows and real income. Card payoffs count once, on the paying account. Visa 'payment thank you' credits are the other side of the same move. Relative stacks visible series to 100% for each period."
        actions={
          <ChartActions>
            <ScaleViews value={scale} onChange={setScale} />
            <PeriodViews value={period} onChange={onPeriodChange} />
          </ChartActions>
        }
        csv={{
          headers: ["Period", "Spend", "Income", "Transfers"],
          rows: data.monthly.map((row) => [
            String(row.label ?? row.month ?? ""),
            Number(row.spend ?? 0),
            Number(row.income ?? 0),
            Number(row.transfers ?? 0),
          ]),
        }}
      />
      <ChartWithSeriesList
        list={
          <SeriesLegend
            series={TREND_SERIES}
            value={visibleKeys}
            onValueChange={setVisibleKeys}
            colors={TREND_LEGEND_COLORS}
          />
        }
      >
        <ChartContainer
          config={TREND_CONFIG}
          className="aspect-[2/1] w-full"
          initialDimension={{ width: 640, height: 280 }}
        >
          <AreaChart
            data={chartRows}
            margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              domain={isRelative ? [0, 100] : ["auto", "auto"]}
              tickFormatter={(value) =>
                isRelative
                  ? formatPercent(Number(value))
                  : moneyTick(Number(value), data.currency)
              }
            />
            <ChartTooltip
              offset={CHART_TOOLTIP_OFFSET}
              allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
              content={
                <ChartTooltipContent
                  hideLabel={false}
                  formatter={(value, name, item) => {
                    if (Number(value) === 0) return null;
                    const label =
                      TREND_CONFIG[name as keyof typeof TREND_CONFIG]?.label ??
                      String(name);
                    const month = (
                      item?.payload as { month?: string } | undefined
                    )?.month;
                    const source = data.monthly.find(
                      (row) => row.month === month,
                    );
                    const money = source
                      ? Number(source[name as keyof typeof source] ?? 0)
                      : Number(value);
                    return (
                      <div className="flex flex-1 justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-medium tabular-nums">
                          {isRelative
                            ? `${formatPercent(Number(value))} (${formatMoney(money, data.currency)})`
                            : formatMoney(Number(value), data.currency)}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            {visibleKeySet.has("spend") ? (
              <Area
                type="monotone"
                dataKey="spend"
                stackId={isRelative ? "trend" : undefined}
                stroke="var(--color-spend)"
                fill="var(--color-spend)"
                fillOpacity={isRelative ? 0.92 : 0.18}
                strokeWidth={2}
                name="spend"
              />
            ) : null}
            {visibleKeySet.has("income") ? (
              <Area
                type="monotone"
                dataKey="income"
                stackId={isRelative ? "trend" : undefined}
                stroke="var(--color-income)"
                fill="var(--color-income)"
                fillOpacity={isRelative ? 0.92 : 0.12}
                strokeWidth={2}
                name="income"
              />
            ) : null}
            {visibleKeySet.has("transfers") ? (
              <Area
                type="monotone"
                dataKey="transfers"
                stackId={isRelative ? "trend" : undefined}
                stroke="var(--color-transfers)"
                fill="var(--color-transfers)"
                fillOpacity={isRelative ? 0.92 : 0.08}
                strokeWidth={1.5}
                strokeDasharray={isRelative ? undefined : "4 4"}
                name="transfers"
              />
            ) : null}
          </AreaChart>
        </ChartContainer>
        <TimeSeriesTable
          rows={chartRows}
          columns={TREND_SERIES.map((item) => ({
            key: item.key,
            label: item.label,
          }))}
          currency={data.currency}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
          valueKind={isRelative ? "percent" : "money"}
        />
      </ChartWithSeriesList>
    </section>
  );
}

function MixTooltipRow({
  label,
  percent,
  money,
  muted = false,
  indent = false,
  strong = false,
  showShare,
  rule = false,
}: {
  label: string;
  percent?: string;
  money: string;
  muted?: boolean;
  indent?: boolean;
  strong?: boolean;
  showShare: boolean;
  rule?: boolean;
}) {
  const tone = `${muted ? "text-muted-foreground" : ""} ${
    strong ? "font-medium" : ""
  } ${rule ? "border-t border-border/50 pt-1.5" : ""}`;
  return (
    <>
      <span className={`min-w-0 truncate ${indent ? "pl-2" : ""} ${tone}`}>
        {label}
      </span>
      {showShare ? (
        <span className={`text-right font-mono tabular-nums ${tone}`}>
          {percent ?? ""}
        </span>
      ) : null}
      <span className={`text-right font-mono tabular-nums ${tone}`}>
        {money}
      </span>
    </>
  );
}

function MixTooltip({
  active,
  payload,
  label,
  config,
  currency,
  otherItems,
  nestedItems,
  scale = "standard",
  sourceRow,
  shareOf,
  /** When set (pie chart), all % use this base instead of the hovered slice. */
  shareBase,
  overlapping = false,
  interactive = true,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string | number; name?: string }>;
  label?: string;
  config: ChartConfig;
  currency: string;
  otherItems?: AnalysisRankedItem[];
  nestedItems?: Record<string, AnalysisRankedItem[]>;
  scale?: MixScale;
  sourceRow?: Record<string, string | number>;
  shareOf?: number;
  shareBase?: number;
  /** Tags (and similar) can mark the same row - do not sum series as unique spend. */
  overlapping?: boolean;
  interactive?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => Number(item.value) > 0);
  if (rows.length === 0) return null;
  const isRelative = scale === "relative";
  const showShare = isRelative || shareOf != null;
  const moneyTotal = sourceRow
    ? rows.reduce((sum, item) => {
        const key = String(item.dataKey ?? item.name ?? "");
        return sum + Math.max(0, Number(sourceRow[key] ?? 0));
      }, 0)
    : rows.reduce((sum, item) => sum + Number(item.value), 0);
  const percentBase =
    shareBase != null && shareBase > 0 ? shareBase : moneyTotal;
  const leftovers = otherItems ?? [];
  const shareFor = (money: number, relativeValue?: number) => {
    if (!showShare) return undefined;
    if (isRelative && relativeValue != null) {
      return formatPercent(relativeValue);
    }
    if (percentBase > 0) {
      return formatPercent((money / percentBase) * 100);
    }
    return undefined;
  };

  type TooltipLine = {
    key: string;
    label: string;
    percent?: string;
    money: string;
    muted?: boolean;
    indent?: boolean;
    strong?: boolean;
  };

  const lines: TooltipLine[] = [];
  for (const item of rows) {
    const key = String(item.dataKey ?? item.name ?? "");
    const name = String(config[key]?.label ?? key);
    const extras =
      key === "other" && leftovers.length > 0
        ? leftovers
        : (nestedItems?.[key] ?? []);
    const money = sourceRow ? Number(sourceRow[key] ?? 0) : Number(item.value);
    lines.push({
      key,
      label: name,
      percent: shareFor(money, Number(item.value)),
      money: formatMoney(money, currency),
      strong: true,
    });
    for (const entry of extras) {
      lines.push({
        key: `${key}:${entry.name}`,
        label: entry.name,
        percent: shareFor(entry.spend),
        money: formatMoney(entry.spend, currency),
        muted: true,
        indent: true,
      });
    }
  }

  const gridClass = showShare
    ? "grid grid-cols-[minmax(0,1fr)_3.25rem_max-content] items-baseline gap-x-3 gap-y-0.5"
    : "grid grid-cols-[minmax(0,1fr)_max-content] items-baseline gap-x-3 gap-y-0.5";
  const totalShare =
    shareOf != null ? formatPercent(shareOf) : showShare ? "100.0%" : undefined;

  return (
    <div
      className={`${interactive ? "pointer-events-auto" : "pointer-events-none"} animate-in fade-in-0 grid min-w-56 max-w-80 gap-1.5 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-xs shadow-xl duration-200`}
    >
      <div className="font-medium">
        {String(label ?? "")}
        {shareOf != null ? ` · ${formatPercent(shareOf)}` : ""}
      </div>
      <div
        className={`${gridClass} max-h-64 overflow-y-auto pr-0.5`}
        onWheel={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight <= el.clientHeight + 1) return;
          const delta = event.deltaY;
          const atTop = el.scrollTop <= 0;
          const atBottom =
            el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          // Only trap wheel while the list can still scroll that way.
          if ((delta < 0 && atTop) || (delta > 0 && atBottom)) return;
          event.stopPropagation();
        }}
      >
        {lines.map((line) => (
          <MixTooltipRow
            key={line.key}
            label={line.label}
            percent={line.percent}
            money={line.money}
            muted={line.muted}
            indent={line.indent}
            strong={line.strong}
            showShare={showShare}
          />
        ))}
        {overlapping ? null : (
          <MixTooltipRow
            label="Total"
            percent={totalShare}
            money={formatMoney(moneyTotal, currency)}
            muted
            strong
            showShare={showShare}
            rule
          />
        )}
      </div>
      {overlapping && rows.length > 1 ? (
        <div className="type-caption border-t border-border/50 pt-1.5">
          Tags can mark the same transactions. Amounts are not additive.
        </div>
      ) : null}
    </div>
  );
}

function useVisibleSeries(series: AnalysisCategorySeries[]) {
  const seriesKey = series.map((item) => item.key).join("\0");
  const allKeys = useMemo(() => series.map((item) => item.key), [seriesKey]);
  const [selected, setSelected] = useState<string[]>(allKeys);
  const selectedKeySet = useMemo(() => new Set(selected), [selected]);
  const visibleKeys = useMemo(() => {
    const next = allKeys.filter((key) => selectedKeySet.has(key));
    return next.length > 0 ? next : allKeys;
  }, [allKeys, selectedKeySet]);
  const visibleKeySet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleSeries = useMemo(
    () => series.filter((item) => visibleKeySet.has(item.key)),
    [series, visibleKeySet],
  );

  return {
    visibleKeys,
    visibleSeries,
    setVisibleKeys: (keys: string[]) => {
      setSelected(keys.length > 0 ? keys : allKeys);
    },
  };
}

function ChartWithSeriesList({
  list,
  children,
}: {
  list: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-4">
      <aside className="min-w-0 pb-1 md:col-span-1 md:sticky md:top-4 md:max-h-[min(72vh,44rem)] md:overflow-y-auto md:pr-1 md:pb-2">
        {list}
      </aside>
      <div className="min-w-0 space-y-3 md:col-span-3">{children}</div>
    </div>
  );
}

function SeriesLegend({
  series,
  value,
  onValueChange,
  colors = CATEGORY_COLORS,
}: {
  series: AnalysisCategorySeries[];
  value: string[];
  onValueChange: (keys: string[]) => void;
  colors?: string[];
}) {
  if (series.length === 0) return null;
  return (
    <ToggleGroup
      type="multiple"
      value={value}
      onValueChange={(next) =>
        onValueChange(
          nextVisibleKeySet(
            series.map((item) => item.key),
            value,
            next,
          ),
        )
      }
      spacing={1}
      aria-label="Filter series"
      className="flex h-auto w-full max-w-full flex-wrap items-start justify-start gap-1 overflow-visible bg-transparent py-1"
    >
      {series.map((item, index) => (
        <ToggleGroupItem
          key={item.key}
          value={item.key}
          size="sm"
          aria-label={`Toggle ${item.label}`}
          className={cn(
            badgeVariants({ variant: "outline" }),
            "min-h-11 min-w-0 max-w-full shrink rounded-sm px-3 font-normal shadow-none sm:min-h-0 sm:px-2 hover:bg-muted data-[state=off]:opacity-40 data-[state=on]:bg-transparent data-[state=on]:text-foreground",
          )}
        >
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{
              backgroundColor: colors[index % colors.length],
            }}
          />
          <span className="truncate text-foreground">{item.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Prefer alternating sides, but keep text inside the plot (no left/right clip). */
function calloutBoxWidth(label: string) {
  const padX = 4;
  const swatchGap = 4;
  const swatchSize = 8;
  // 0.875rem medium + swatch; stay generous so short names ("Needs") never ellipsis.
  return Math.min(
    Math.max(label.length * 9.2 + padX * 2 + swatchSize + swatchGap + 8, 72),
    240,
  );
}

function calloutSideFromIndex(peakIndex: number, pointCount: number): 1 | -1 {
  if (peakIndex <= 1) return 1;
  if (peakIndex >= Math.max(pointCount - 2, 0)) return -1;
  return peakIndex % 2 === 0 ? 1 : -1;
}

function calloutSide(
  x: number,
  itemIndex: number,
  label: string,
  peakIndex: number,
  pointCount: number,
): 1 | -1 {
  const approxWidth = calloutBoxWidth(label);
  const preferred = calloutSideFromIndex(peakIndex, pointCount);
  if (peakIndex <= 1 || x < approxWidth + 72) return 1;
  if (peakIndex >= Math.max(pointCount - 2, 0)) return -1;
  if (preferred === -1 && x < approxWidth + 96) return 1;
  if (itemIndex % 2 === 1 && preferred === 1 && x > approxWidth + 96) {
    return -1;
  }
  return preferred;
}

/** Prefer unique months so several series are not labeled on the same x. */
function spreadPeakIndexes(
  series: AnalysisCategorySeries[],
  rows: Array<Record<string, string | number>>,
): Map<string, number> {
  const peaks = new Map<string, number>();
  const claimed = new Set<number>();
  const ranked = [...series].sort((left, right) => {
    const leftMax = Math.max(
      0,
      ...rows.map((row) => Number(row[left.key] ?? 0)),
    );
    const rightMax = Math.max(
      0,
      ...rows.map((row) => Number(row[right.key] ?? 0)),
    );
    return rightMax - leftMax;
  });

  for (const item of ranked) {
    const rankedMonths = rows
      .map((row, index) => ({
        index,
        value: Number(row[item.key] ?? 0),
      }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value);
    const free = rankedMonths.find((entry) => !claimed.has(entry.index));
    const chosen = free ?? rankedMonths[0];
    const index = chosen?.index ?? 0;
    peaks.set(item.key, index);
    claimed.add(index);
  }
  return peaks;
}

function layoutAreaCallouts(
  series: AnalysisCategorySeries[],
  peakIndexByKey: Map<string, number>,
  pointCount: number,
): Map<string, { side: 1 | -1; lift: number }> {
  const next = new Map<string, { side: 1 | -1; lift: number }>();
  const used: Array<{ index: number; side: 1 | -1; band: number }> = [];
  const nearby = 1;

  const conflicts = (index: number, side: 1 | -1, band: number) =>
    used.some(
      (entry) =>
        entry.side === side &&
        entry.band === band &&
        Math.abs(entry.index - index) <= nearby,
    );

  const edgeSide = (index: number): 1 | -1 | null => {
    if (index <= 1) return 1;
    if (index >= Math.max(pointCount - 2, 0)) return -1;
    return null;
  };

  for (const item of series) {
    const index = peakIndexByKey.get(item.key) ?? 0;
    const preferred =
      edgeSide(index) ?? calloutSideFromIndex(index, pointCount);
    const other: 1 | -1 = preferred === 1 ? -1 : 1;
    const forced = edgeSide(index);
    const sides: Array<1 | -1> = forced != null ? [forced] : [preferred, other];
    let side = preferred;
    let band = 0;
    found: for (let nextBand = 0; nextBand <= 8; nextBand += 1) {
      for (const candidate of sides) {
        if (!conflicts(index, candidate, nextBand)) {
          side = candidate;
          band = nextBand;
          break found;
        }
      }
    }
    used.push({ index, side, band });
    next.set(item.key, { side, lift: band * 28 });
  }
  return next;
}

function AreaCallout({
  x,
  y,
  label,
  color,
  side,
  lift,
}: {
  x: number;
  y: number;
  label: string;
  color: string;
  side: 1 | -1;
  lift: number;
}) {
  const anchorX = x;
  const anchorY = y + 7;
  const labelX = x + side * 32;
  // Keep labels inside the SVG - peaks at 100% sit near y≈margin.top.
  const minLabelY = 12;
  const maxBelow = y + 22 + lift;
  const desiredLabelY = y - 12 - lift;
  const placeBelow = desiredLabelY < minLabelY;
  const labelY = placeBelow ? maxBelow : desiredLabelY;
  const padX = 4;
  const boxH = 22;
  const boxW = calloutBoxWidth(label);
  const textX = labelX + side * 5;
  const boxX = side === 1 ? textX - padX : textX - boxW + padX;
  const boxY = labelY - boxH / 2;

  return (
    <g style={{ pointerEvents: "none" }}>
      <line
        x1={anchorX}
        y1={anchorY}
        x2={labelX}
        y2={labelY + (placeBelow ? -2 : 2)}
        stroke="#111"
        strokeWidth={1}
      />
      <circle cx={anchorX} cy={anchorY} r={2.25} fill="#111" />
      <foreignObject x={boxX} y={boxY} width={boxW} height={boxH}>
        <div className="flex h-full min-w-0 items-center justify-center gap-1 rounded-md bg-[var(--background)]/55 px-1 text-center text-sm leading-none font-medium whitespace-nowrap text-[#111] backdrop-blur-[3px]">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px] border border-black/15"
            style={{ backgroundColor: color }}
          />
          <span className="min-w-0 overflow-hidden text-ellipsis">{label}</span>
        </div>
      </foreignObject>
    </g>
  );
}

function OtherBreakdownTable({
  items,
  currency,
}: {
  items?: AnalysisRankedItem[];
  currency: string;
}) {
  const series = useMemo(
    () => (items ?? []).map((item) => ({ key: item.name, label: item.name })),
    [items],
  );
  const { visibleKeys, setVisibleKeys } = useVisibleSeries(series);
  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleItems = (items ?? []).filter((item) =>
    visibleSet.has(item.name),
  );
  const total = visibleItems.reduce((sum, item) => sum + item.spend, 0);
  const allKeys = series.map((item) => item.key);

  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Other ({visibleItems.length})</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Last 15% of spend, rolled into Other. Click a name to hide it. Share
          is of this pile.
        </p>
      </div>
      <Table
        variant="lined"
        containerClassName="max-h-72 overflow-auto rounded-lg border border-border [transform:none]"
        className={cn(
          "border-separate! border-spacing-0 [transform:none] text-[0.7rem] sm:text-sm",
          "[&_th]:h-8 [&_th]:px-1.5 [&_th]:py-1 sm:[&_th]:h-10 sm:[&_th]:px-2 sm:[&_th]:py-0",
          "[&_td]:px-1.5 [&_td]:py-1 sm:[&_td]:p-2",
          "[&_thead_th]:border-t-0 [&_tbody_tr:first-child_td]:border-t-0",
        )}
      >
        <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-surface-elevated [&_th]:shadow-[inset_0_-1px_0_var(--border)]">
          <TableRow>
            <TableHead className="font-mono">Name</TableHead>
            <TableHead className="text-right font-mono">Spend</TableHead>
            <TableHead className="text-right font-mono">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const on = visibleSet.has(item.name);
            return (
              <TableRow key={item.name}>
                <TableCell className="max-w-[18rem] truncate font-mono font-medium">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Toggle ${item.name}`}
                    onClick={() =>
                      setVisibleKeys(
                        nextVisibleKeys(allKeys, visibleKeys, item.name),
                      )
                    }
                    className={cn(
                      "block max-w-full truncate text-left font-medium hover:bg-muted",
                      !on && "opacity-40 line-through",
                    )}
                    title={item.name}
                  >
                    {item.name}
                  </button>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-[0.7rem] tabular-nums sm:text-sm",
                    !on && "opacity-40",
                  )}
                >
                  <MoneyText
                    amount={item.spend}
                    currency={currency}
                    className="w-auto text-[0.7rem] sm:text-sm"
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-[0.7rem] tabular-nums text-muted-foreground sm:text-sm",
                    !on && "opacity-40",
                  )}
                >
                  {on ? formatShare(item.spend, total) : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="border-t-0 bg-muted [&_td]:sticky [&_td]:bottom-0 [&_td]:z-20 [&_td]:border-b-0 [&_td]:bg-muted [&_td]:text-muted-foreground [&_td]:shadow-[inset_0_1px_0_var(--border)]">
          <TableRow>
            <TableCell className="font-mono">Total</TableCell>
            <TableCell className="text-right font-mono text-[0.7rem] tabular-nums sm:text-sm">
              <MoneyText
                amount={total}
                currency={currency}
                className="w-auto text-[0.7rem] sm:text-sm"
              />
            </TableCell>
            <TableCell className="text-right font-mono text-[0.7rem] tabular-nums sm:text-sm">
              100.0%
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function StackedMixChart({
  title,
  info,
  series,
  monthly,
  currency,
  period,
  onPeriodChange,
  variant = "bar",
  other,
  otherByPeriod,
  nestedByPeriod,
  overlapping = false,
}: {
  title: string;
  info: string;
  series: AnalysisCategorySeries[];
  monthly: Array<Record<string, string | number>>;
  currency: string;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  variant?: "bar" | "area";
  other?: AnalysisRankedItem[];
  otherByPeriod?: Record<string, AnalysisRankedItem[]>;
  nestedByPeriod?: Record<string, Record<string, AnalysisRankedItem[]>>;
  /** Multi-label series (tags): standard mode draws unstacked so shared rows are not double-counted. */
  overlapping?: boolean;
}) {
  const { visibleKeys, visibleSeries, setVisibleKeys } =
    useVisibleSeries(series);
  const [scale, setScale] = useState<MixScale>("standard");
  const isArea = variant === "area";
  const isRelative = isArea && scale === "relative";
  const stackAreas = !overlapping || isRelative;
  const chartShellRef = useRef<HTMLDivElement>(null);
  const tooltipOpenRef = useRef(false);
  const [tooltipForcedOff, setTooltipForcedOff] = useState(false);

  useEffect(() => {
    const dismiss = () => {
      if (!tooltipOpenRef.current) return;
      tooltipOpenRef.current = false;
      setTooltipForcedOff(true);
    };
    const dismissIfOutside = (event: PointerEvent) => {
      if (!tooltipOpenRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (chartShellRef.current?.contains(target)) return;
      dismiss();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dismiss();
    };
    document.addEventListener("pointerdown", dismissIfOutside);
    document.addEventListener("keydown", dismissOnEscape);
    // Page actually moved - drop the click tooltip so it does not chase the cursor.
    window.addEventListener("scroll", dismiss, {
      passive: true,
      capture: true,
    });
    return () => {
      document.removeEventListener("pointerdown", dismissIfOutside);
      document.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);

  const markTooltipOpen = () => {
    tooltipOpenRef.current = true;
    setTooltipForcedOff(false);
  };
  const chartRows = useMemo(
    () => (isRelative ? toRelativeRows(monthly, visibleKeys) : monthly),
    [isRelative, monthly, visibleKeys],
  );
  const config = useMemo(() => {
    const next: ChartConfig = {};
    series.forEach((item, index) => {
      next[item.key] = {
        label: item.label,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
    });
    return next;
  }, [series]);
  const peakIndexByKey = useMemo(
    () => spreadPeakIndexes(visibleSeries, chartRows),
    [chartRows, visibleSeries],
  );
  const calloutLayoutByKey = useMemo(
    () => layoutAreaCallouts(visibleSeries, peakIndexByKey, chartRows.length),
    [visibleSeries, peakIndexByKey, chartRows.length],
  );
  const lastKey = visibleSeries[visibleSeries.length - 1]?.key ?? "";

  if (series.length === 0) return null;

  const mixTooltip = (
    <ChartTooltip
      trigger="click"
      active={tooltipForcedOff ? false : undefined}
      offset={CHART_TOOLTIP_OFFSET}
      allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
      wrapperStyle={{ pointerEvents: "auto", zIndex: 40 }}
      content={(props) => {
        const row = props.payload?.[0]?.payload as
          | { month?: string }
          | undefined;
        const month = row?.month;
        const periodItems =
          month && otherByPeriod?.[month]?.length
            ? otherByPeriod[month]
            : other;
        const sourceRow = month
          ? monthly.find((item) => String(item.month) === String(month))
          : undefined;
        return (
          <MixTooltip
            active={props.active}
            payload={(props.payload ?? []).map((item) => ({
              value: Number(item.value),
              dataKey:
                typeof item.dataKey === "string" ||
                typeof item.dataKey === "number"
                  ? item.dataKey
                  : undefined,
              name: item.name == null ? undefined : String(item.name),
            }))}
            label={props.label == null ? undefined : String(props.label)}
            config={config}
            currency={currency}
            otherItems={periodItems}
            nestedItems={month ? nestedByPeriod?.[month] : undefined}
            scale={isRelative ? "relative" : "standard"}
            sourceRow={sourceRow}
            overlapping={overlapping}
          />
        );
      }}
    />
  );

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        actions={
          <ChartActions>
            {isArea ? <ScaleViews value={scale} onChange={setScale} /> : null}
            <PeriodViews value={period} onChange={onPeriodChange} />
          </ChartActions>
        }
        csv={{
          headers: ["Period", ...series.map((item) => item.label)],
          rows: monthly.map((row) => [
            String(row.label ?? row.month ?? ""),
            ...series.map((item) => Number(row[item.key] ?? 0)),
          ]),
        }}
      />
      <ChartWithSeriesList
        list={
          <SeriesLegend
            series={series}
            value={visibleKeys}
            onValueChange={setVisibleKeys}
          />
        }
      >
        <div ref={chartShellRef}>
          <ChartContainer
            config={config}
            className={
              isArea
                ? "aspect-[5/2] w-full overflow-visible"
                : "aspect-[2/1] w-full overflow-visible"
            }
            initialDimension={{ width: 640, height: isArea ? 320 : 280 }}
          >
            {isArea ? (
              <AreaChart
                data={chartRows}
                margin={{ left: 12, right: 48, top: 44, bottom: 0 }}
                accessibilityLayer
                onClick={(state) => {
                  if (state?.activeTooltipIndex != null) markTooltipOpen();
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={88}
                  tickMargin={6}
                  domain={isRelative ? [0, 100] : ["auto", "auto"]}
                  tickFormatter={(value) =>
                    isRelative
                      ? formatPercent(Number(value))
                      : moneyTick(Number(value), currency)
                  }
                />
                {mixTooltip}
                {visibleSeries.map((item) => (
                  <Area
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    stackId={stackAreas ? "spend" : undefined}
                    stroke="var(--foreground)"
                    strokeOpacity={0.72}
                    fill={`var(--color-${item.key})`}
                    fillOpacity={stackAreas ? 0.52 : 0.28}
                    strokeWidth={1.75}
                    name={item.label}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: `oklch(from var(--color-${item.key}) 0.42 calc(c * 1.4) h)`,
                      stroke: `oklch(from var(--color-${item.key}) 0.3 calc(c * 1.25) h)`,
                      strokeWidth: 1,
                    }}
                  >
                    <LabelList
                      dataKey={item.key}
                      content={(props) => {
                        const peakIndex = peakIndexByKey.get(item.key) ?? -1;
                        if (props.index !== peakIndex) return null;
                        const row = chartRows[peakIndex];
                        const value = Number(row?.[item.key] ?? 0);
                        const peakBaseline = stackAreas
                          ? visibleSeries.reduce(
                              (sum, entry) =>
                                sum + Number(row?.[entry.key] ?? 0),
                              0,
                            )
                          : Math.max(
                              ...visibleSeries.map((entry) =>
                                Number(row?.[entry.key] ?? 0),
                              ),
                              0,
                            );
                        if (
                          value <= 0 ||
                          peakBaseline <= 0 ||
                          value / peakBaseline < 0.05
                        ) {
                          return null;
                        }
                        const x = Number(props.x ?? 0);
                        const y = Number(props.y ?? 0);
                        if (!Number.isFinite(x) || !Number.isFinite(y))
                          return null;
                        const itemIndex = visibleSeries.findIndex(
                          (entry) => entry.key === item.key,
                        );
                        const layout = calloutLayoutByKey.get(item.key);
                        const side =
                          layout?.side ??
                          calloutSide(
                            x,
                            itemIndex,
                            item.label,
                            peakIndex,
                            chartRows.length,
                          );
                        return (
                          <AreaCallout
                            x={x}
                            y={y}
                            label={item.label}
                            color={`var(--color-${item.key})`}
                            side={x < 96 ? 1 : side}
                            lift={layout?.lift ?? (itemIndex % 3) * 12}
                          />
                        );
                      }}
                    />
                  </Area>
                ))}
              </AreaChart>
            ) : (
              <BarChart
                data={monthly}
                margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
                accessibilityLayer
                onClick={(state) => {
                  if (state?.activeTooltipIndex != null) markTooltipOpen();
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value) => moneyTick(Number(value), currency)}
                />
                {mixTooltip}
                {visibleSeries.map((item) => (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    stackId="spend"
                    fill={`var(--color-${item.key})`}
                    radius={item.key === lastKey ? [3, 3, 0, 0] : 0}
                    name={item.label}
                  />
                ))}
              </BarChart>
            )}
          </ChartContainer>
        </div>
        <TimeSeriesTable
          rows={chartRows}
          columns={series.map((item) => ({
            key: item.key,
            label: item.label,
          }))}
          currency={currency}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
          valueKind={isRelative ? "percent" : "money"}
        />
        <OtherBreakdownTable items={other} currency={currency} />
      </ChartWithSeriesList>
    </section>
  );
}

function stackedRowTooltip(
  props: {
    active?: boolean;
    payload?: ReadonlyArray<{
      value?: unknown;
      dataKey?: string | number | ((obj: unknown) => unknown);
      name?: unknown;
      payload?: unknown;
    }>;
    label?: unknown;
  },
  config: ChartConfig,
  currency: string,
  otherByRow?: Record<string, AnalysisRankedItem[]>,
  series?: AnalysisCategorySeries[],
  pieTotal?: number,
  interactive = true,
) {
  const raw = props.payload?.[0]?.payload;
  const row =
    raw && typeof raw === "object"
      ? (raw as Record<string, string | number>)
      : undefined;
  const rowName = String(row?.name ?? props.label ?? "");
  const payload =
    series && row
      ? series.map((item) => ({
          value: Number(row[item.key] ?? 0),
          dataKey: item.key,
          name: item.label,
        }))
      : (props.payload ?? []).map((item) => ({
          value: Number(item.value),
          dataKey:
            typeof item.dataKey === "string" || typeof item.dataKey === "number"
              ? item.dataKey
              : undefined,
          name: item.name == null ? undefined : String(item.name),
        }));
  const sliceSpend = Number(row?.spend ?? 0);
  const shareOf =
    pieTotal && pieTotal > 0 && sliceSpend > 0
      ? (sliceSpend / pieTotal) * 100
      : undefined;
  return (
    <MixTooltip
      active={props.active}
      payload={payload}
      label={rowName}
      config={config}
      currency={currency}
      otherItems={otherByRow?.[rowName]}
      shareOf={shareOf}
      shareBase={pieTotal && pieTotal > 0 ? pieTotal : undefined}
      interactive={interactive}
    />
  );
}

function StackedRankedBarChart({
  title,
  info,
  rows,
  series,
  currency,
  labelWidth = 160,
  onSelect,
  otherByRow,
  showViewToggle = false,
}: {
  title: string;
  info: string;
  rows: Array<Record<string, string | number>>;
  series: AnalysisCategorySeries[];
  currency: string;
  labelWidth?: number;
  onSelect?: (name: string) => void;
  otherByRow?: Record<string, AnalysisRankedItem[]>;
  showViewToggle?: boolean;
}) {
  const { visibleKeys, visibleSeries, setVisibleKeys } =
    useVisibleSeries(series);
  const [view, setView] = useState<BreakdownView>("area");
  const config = useMemo(() => {
    const next: ChartConfig = {};
    series.forEach((item, index) => {
      next[item.key] = {
        label: item.label,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
    });
    return next;
  }, [series]);
  const lastKey = visibleSeries[visibleSeries.length - 1]?.key ?? "";
  const isPie = showViewToggle && view === "pie";
  const isArea = showViewToggle && view === "area";
  const visibleRows = useMemo(
    () =>
      rows
        .map((row) => ({
          ...row,
          name: String(row.name ?? ""),
          spend: visibleSeries.reduce(
            (sum, item) => sum + Number(row[item.key] ?? 0),
            0,
          ),
        }))
        .filter((row) => row.spend > 0),
    [rows, visibleSeries],
  );
  const pieRows = visibleRows;
  const pieTotal = pieRows.reduce((sum, row) => sum + Number(row.spend), 0);
  const pieCalloutColumnsBySide = useMemo(
    () =>
      pieCalloutColumns(
        pieRows.map((row) => ({
          name: String(row.name),
          spend: Number(row.spend),
        })),
        pieTotal,
      ),
    [pieRows, pieTotal],
  );

  if (rows.length === 0 || series.length === 0) return null;

  const compactBars = visibleRows.length > 16;
  const barRowRem = compactBars ? 1.5 : 2.4;
  const barRowPx = compactBars ? 24 : 38;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        actions={
          showViewToggle ? (
            <SegmentedControl
              ariaLabel="Breakdown chart type"
              options={BREAKDOWN_VIEW_OPTIONS}
              value={view}
              onChange={setView}
            />
          ) : undefined
        }
        csv={{
          headers: ["Name", ...series.map((item) => item.label), "Spend"],
          rows: rows.map((row) => [
            String(row.name ?? ""),
            ...series.map((item) => Number(row[item.key] ?? 0)),
            Number(row.spend ?? 0),
          ]),
        }}
      />
      <ChartWithSeriesList
        list={
          <SeriesLegend
            series={series}
            value={visibleKeys}
            onValueChange={setVisibleKeys}
          />
        }
      >
        {isPie ? (
          <ChartContainer
            config={config}
            className="mx-auto aspect-auto h-[448px] w-full max-w-6xl"
            initialDimension={{ width: 960, height: 448 }}
          >
            <PieChart
              accessibilityLayer
              margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <ChartTooltip
                offset={CHART_TOOLTIP_OFFSET}
                allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
                wrapperStyle={{ pointerEvents: "none" }}
                content={(props) =>
                  stackedRowTooltip(
                    props,
                    config,
                    currency,
                    otherByRow,
                    visibleSeries,
                    pieTotal,
                    false,
                  )
                }
              />
              <Pie
                data={pieRows}
                dataKey="spend"
                nameKey="name"
                innerRadius="42%"
                outerRadius="78%"
                paddingAngle={PIE_PADDING_ANGLE}
                stroke="var(--background)"
                strokeWidth={2}
                isAnimationActive={false}
                activeShape={false}
                style={onSelect ? { cursor: "pointer" } : undefined}
                onClick={(data) => {
                  const name =
                    data && typeof data === "object" && "name" in data
                      ? String((data as { name?: string }).name ?? "")
                      : "";
                  if (onSelect && name) onSelect(name);
                }}
                label={(props) => (
                  <PieDonutLabel {...props} columns={pieCalloutColumnsBySide} />
                )}
                labelLine={false}
              >
                <Label
                  position="center"
                  content={({ viewBox }) => (
                    <PieCenterTotal
                      viewBox={viewBox as { cx?: number; cy?: number }}
                      total={pieTotal}
                      currency={currency}
                    />
                  )}
                />
                {pieRows.map((row, index) => (
                  <Cell
                    key={String(row.name)}
                    fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : isArea ? (
          <ChartContainer
            config={config}
            className="mx-auto aspect-[4/3] w-full max-w-5xl [&_foreignObject]:overflow-hidden"
            initialDimension={{ width: 800, height: 600 }}
          >
            <Treemap
              data={pieRows}
              dataKey="spend"
              nameKey="name"
              stroke="var(--background)"
              fill="transparent"
              isAnimationActive={false}
              style={onSelect ? { cursor: "pointer" } : undefined}
              onClick={(node) => {
                const name =
                  node && typeof node === "object" && "name" in node
                    ? String((node as { name?: string }).name ?? "")
                    : "";
                if (onSelect && name) onSelect(name);
              }}
              content={(props) => (
                <AreaTreemapCell
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  height={props.height}
                  name={props.name}
                  value={props.value}
                  index={props.index}
                  depth={props.depth}
                  currency={currency}
                  total={pieTotal}
                />
              )}
            >
              <ChartTooltip
                offset={CHART_TOOLTIP_OFFSET}
                allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
                wrapperStyle={{ pointerEvents: "none" }}
                content={(props) =>
                  stackedRowTooltip(
                    props,
                    config,
                    currency,
                    otherByRow,
                    visibleSeries,
                    pieTotal,
                    false,
                  )
                }
              />
            </Treemap>
          </ChartContainer>
        ) : (
          <ChartContainer
            config={config}
            className="aspect-auto w-full"
            style={{
              ["--rows" as string]: visibleRows.length,
              height: `calc(${barRowRem}rem * ${Math.max(visibleRows.length, 1)} + 5.5rem)`,
            }}
            initialDimension={{
              width: 640,
              height: Math.max(420, visibleRows.length * barRowPx + 48),
            }}
          >
            <BarChart
              data={visibleRows}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 10, bottom: 24 }}
              accessibilityLayer
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={labelWidth}
                interval={0}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => moneyTick(Number(value), currency)}
              />
              <ChartTooltip
                offset={CHART_TOOLTIP_OFFSET}
                allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
                content={(props) =>
                  stackedRowTooltip(
                    props,
                    config,
                    currency,
                    otherByRow,
                    visibleSeries,
                  )
                }
              />
              {visibleSeries.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  stackId="stack"
                  fill={`var(--color-${item.key})`}
                  radius={item.key === lastKey ? [0, 4, 4, 0] : 0}
                  name={item.label}
                  onClick={(data) => {
                    const row = data as { payload?: { name?: string } };
                    const name = row.payload?.name;
                    if (onSelect && typeof name === "string") onSelect(name);
                  }}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </ChartWithSeriesList>
    </section>
  );
}

function formatShare(spend: number, total: number) {
  if (total <= 0) return "-";
  return `${((spend / total) * 100).toFixed(1)}%`;
}

function stackedBreakdownText(
  rowName: string,
  stacked: AnalysisStackedRankedBreakdown | undefined,
  currency: string,
) {
  if (!stacked) return null;
  const row = stacked.rows.find((item) => item.name === rowName);
  if (!row) return null;

  const leftovers = stacked.otherByRow?.[rowName] ?? [];
  const leftoverSet = new Set(leftovers.map((item) => item.name));
  const named = stacked.series
    .filter((series) => series.key !== "other")
    .map((series) => ({
      label: series.label,
      spend: Number(row[series.key] ?? 0),
    }))
    .filter((item) => item.spend > 0 && !leftoverSet.has(item.label))
    .sort((a, b) => b.spend - a.spend)
    .map((item) => `${item.label} (${formatMoney(item.spend, currency)})`);
  const leftoverParts = leftovers.map(
    (item) => `${item.name} (${formatMoney(item.spend, currency)})`,
  );
  if (leftovers.length === 0) {
    const otherSeries = stacked.series.find((series) => series.key === "other");
    const otherSpend = otherSeries ? Number(row[otherSeries.key] ?? 0) : 0;
    if (otherSpend > 0) {
      leftoverParts.push(`Other (${formatMoney(otherSpend, currency)})`);
    }
  }
  const parts = [...named, ...leftoverParts];

  return parts.length > 0 ? parts.join(" · ") : null;
}

function TaxonomyBreakdownTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  totalSpend,
  nestedLabel,
  stacked,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  totalSpend: number;
  nestedLabel?: string;
  stacked?: AnalysisStackedRankedBreakdown;
}) {
  const asMerchant = isMerchantNameLabel(nameLabel);
  const series = useMemo(
    () => rows.map((row) => ({ key: row.name, label: row.name })),
    [rows],
  );
  const { visibleKeys, setVisibleKeys } = useVisibleSeries(series);
  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);
  const visibleRows = rows.filter((row) => visibleSet.has(row.name));
  const tableTotal = visibleRows.reduce((sum, row) => sum + row.spend, 0);
  const allKeys = series.map((item) => item.key);

  if (rows.length === 0) return null;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        csv={{
          headers: nestedLabel
            ? [nameLabel, nestedLabel, "Spend", "Count", "Share %"]
            : [nameLabel, "Spend", "Count", "Share %"],
          rows: rows.map((row) => {
            const share =
              totalSpend > 0
                ? Math.round((row.spend / totalSpend) * 10000) / 100
                : 0;
            const nested = nestedLabel
              ? (stackedBreakdownText(row.name, stacked, currency) ?? "")
              : null;
            return nestedLabel
              ? [row.name, nested, row.spend, row.count ?? 0, share]
              : [row.name, row.spend, row.count ?? 0, share];
          }),
        }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{nameLabel}</TableHead>
            {nestedLabel ? <TableHead>{nestedLabel}</TableHead> : null}
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead className="text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const on = visibleSet.has(row.name);
            const nested = stackedBreakdownText(row.name, stacked, currency);
            return (
              <TableRow key={row.name} className={cn(!on && "opacity-40")}>
                <TableCell className="max-w-[16rem] truncate font-medium">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Toggle ${row.name}`}
                    onClick={() =>
                      setVisibleKeys(
                        nextVisibleKeys(allKeys, visibleKeys, row.name),
                      )
                    }
                    className={cn(
                      "block max-w-full truncate text-left font-medium hover:bg-muted",
                      !on && "line-through",
                    )}
                    title={row.name}
                  >
                    {asMerchant ? <MerchantLabel name={row.name} /> : row.name}
                  </button>
                </TableCell>
                {nestedLabel ? (
                  <TableCell className="max-w-md truncate text-[var(--muted-foreground)]">
                    {nested ?? "-"}
                  </TableCell>
                ) : null}
                <TableCell className="text-right">
                  <MoneyText amount={row.spend} currency={currency} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {formatCount(row.count ?? 0)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {on ? formatShare(row.spend, totalSpend) : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="text-muted-foreground">
            <TableCell colSpan={nestedLabel ? 2 : 1}>Total</TableCell>
            <TableCell className="text-right">
              <MoneyText amount={tableTotal} currency={currency} />
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {visibleRows.reduce((sum, row) => sum + (row.count ?? 0), 0)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatShare(tableTotal, totalSpend)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

const RANKED_BAR_PREVIEW = 12;
const RANKED_BAR_ROW_PX = 36;
const RANKED_BAR_MAX_VIEWPORT_PX = 28 * 16;

function truncateChartLabel(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

function RankedBarChart({
  title,
  info,
  rows,
  currency,
  color = "oklch(0.5 0.1 220)",
  labelWidth = 120,
  onSelect,
}: {
  title: string;
  info: string;
  rows: AnalysisRankedItem[];
  currency: string;
  color?: string;
  labelWidth?: number;
  onSelect?: (name: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const config = {
    spend: { label: "Spend", color },
  } satisfies ChartConfig;

  if (rows.length === 0) return null;

  const hasMore = rows.length > RANKED_BAR_PREVIEW;
  const visible = showAll ? rows : rows.slice(0, RANKED_BAR_PREVIEW);
  const chartHeight = visible.length * RANKED_BAR_ROW_PX + 48;
  const useScroll = chartHeight > RANKED_BAR_MAX_VIEWPORT_PX;
  const nameMaxChars = labelWidth >= 140 ? 22 : 16;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        csv={{
          headers: ["Name", "Spend", "Count"],
          rows: rows.map((row) => [row.name, row.spend, row.count ?? 0]),
        }}
      />
      <div
        className={useScroll ? "max-h-[28rem] overflow-y-auto pr-1" : undefined}
      >
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: chartHeight }}
          initialDimension={{ width: 640, height: chartHeight }}
        >
          <BarChart
            data={visible}
            layout="vertical"
            margin={{ left: 8, right: 52, top: 8, bottom: 0 }}
            accessibilityLayer
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={labelWidth}
              interval={0}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) =>
                truncateChartLabel(String(value), nameMaxChars)
              }
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              domain={[0, (dataMax: number) => dataMax * 1.18]}
              tickFormatter={(value) => moneyTick(Number(value), currency)}
            />
            <ChartTooltip
              offset={CHART_TOOLTIP_OFFSET}
              allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, _name, item) => {
                    const name = String(
                      (item?.payload as AnalysisRankedItem | undefined)?.name ??
                        "",
                    );
                    const count = Number(
                      (item?.payload as AnalysisRankedItem | undefined)
                        ?.count ?? 0,
                    );
                    return (
                      <div className="flex w-full flex-col gap-0.5">
                        {name ? (
                          <span className="font-medium">{name}</span>
                        ) : null}
                        <span>{formatMoney(Number(value), currency)}</span>
                        <span className="text-[var(--muted-foreground)]">
                          {count} txn{count === 1 ? "" : "s"}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="spend"
              fill="var(--color-spend)"
              radius={[0, 4, 4, 0]}
              name="spend"
              onClick={(data) => {
                const row = data as {
                  name?: string;
                  payload?: { name?: string };
                };
                const name = row.payload?.name ?? row.name;
                if (onSelect && typeof name === "string") onSelect(name);
              }}
            >
              <LabelList
                dataKey="spend"
                position="right"
                className="fill-[var(--muted-foreground)] text-xs tabular-nums"
                formatter={(value) => moneyTick(Number(value), currency)}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      {hasMore ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-[var(--muted-foreground)]"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll
            ? "Show less"
            : `Show more (${rows.length - RANKED_BAR_PREVIEW} more)`}
          <ChevronDownIcon
            className={`size-4 transition-transform ${showAll ? "rotate-180" : ""}`}
          />
        </Button>
      ) : null}
    </section>
  );
}

function WeekdayChart({ data }: { data: AnalysisData }) {
  const config = {
    spend: { label: "Spend", color: "oklch(0.52 0.1 155)" },
  } satisfies ChartConfig;

  if (data.weekdays.length === 0) return null;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title="Spend by weekday"
        info="Day you spent, from the authorized date when we have it. Posted date is the fallback. Weekend swipes no longer pile onto Monday."
        csv={{
          headers: ["Weekday", "Spend", "Count"],
          rows: data.weekdays.map((row) => [
            row.name,
            row.spend,
            row.count ?? 0,
          ]),
        }}
      />
      <ChartContainer
        config={config}
        className="aspect-[2/1] w-full"
        initialDimension={{ width: 640, height: 240 }}
      >
        <BarChart
          data={data.weekdays}
          margin={{ left: 12, right: 8, top: 8, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => String(value).slice(0, 3)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={88}
            tickMargin={6}
            tickFormatter={(value) => moneyTick(Number(value), data.currency)}
          />
          <ChartTooltip
            offset={CHART_TOOLTIP_OFFSET}
            allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
            content={
              <ChartTooltipContent
                formatter={(value) => formatMoney(Number(value), data.currency)}
              />
            }
          />
          <Bar
            dataKey="spend"
            fill="var(--color-spend)"
            radius={[4, 4, 0, 0]}
            name="spend"
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

function DayOfMonthChart({ data }: { data: AnalysisData }) {
  const rows = data.dayOfMonth ?? [];
  const config = {
    spend: { label: "Spend", color: "oklch(0.55 0.12 35)" },
  } satisfies ChartConfig;

  if (rows.every((row) => row.spend === 0)) return null;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title="Spend by day of month"
        info="Calendar day (1-31) of the authorized date when present. Spikes often line up with rent, loans, or payday shopping."
        csv={{
          headers: ["Day", "Spend", "Count"],
          rows: rows.map((row) => [row.name, row.spend, row.count ?? 0]),
        }}
      />
      <ChartContainer
        config={config}
        className="aspect-[2.4/1] w-full"
        initialDimension={{ width: 640, height: 240 }}
      >
        <BarChart
          data={rows}
          margin={{ left: 12, right: 8, top: 8, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={1}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={88}
            tickMargin={6}
            tickFormatter={(value) => moneyTick(Number(value), data.currency)}
          />
          <ChartTooltip
            offset={CHART_TOOLTIP_OFFSET}
            allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `Day ${label}`}
                formatter={(value, _name, item) => {
                  const count = Number(
                    (item?.payload as AnalysisRankedItem | undefined)?.count ??
                      0,
                  );
                  return (
                    <div className="flex w-full flex-col gap-0.5">
                      <span>{formatMoney(Number(value), data.currency)}</span>
                      <span className="text-[var(--muted-foreground)]">
                        {count} txn{count === 1 ? "" : "s"}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="spend"
            fill="var(--color-spend)"
            radius={[3, 3, 0, 0]}
            name="spend"
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

function FrequencyBarChart({
  title,
  info,
  rows,
  currency,
  color = "oklch(0.5 0.1 220)",
  labelWidth = 140,
}: {
  title: string;
  info: string;
  rows: AnalysisRankedItem[];
  currency: string;
  color?: string;
  labelWidth?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const config = {
    count: { label: "Trips", color },
  } satisfies ChartConfig;

  if (rows.length === 0) return null;

  const hasMore = rows.length > RANKED_BAR_PREVIEW;
  const visible = showAll ? rows : rows.slice(0, RANKED_BAR_PREVIEW);
  const chartHeight = visible.length * RANKED_BAR_ROW_PX + 48;
  const useScroll = chartHeight > RANKED_BAR_MAX_VIEWPORT_PX;
  const nameMaxChars = labelWidth >= 140 ? 22 : 16;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        csv={{
          headers: ["Name", "Trips", "Spend"],
          rows: rows.map((row) => [row.name, row.count ?? 0, row.spend]),
        }}
      />
      <div
        className={useScroll ? "max-h-[28rem] overflow-y-auto pr-1" : undefined}
      >
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: chartHeight }}
          initialDimension={{ width: 640, height: chartHeight }}
        >
          <BarChart
            data={visible}
            layout="vertical"
            margin={{ left: 8, right: 40, top: 8, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={labelWidth}
              interval={0}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) =>
                truncateChartLabel(String(value), nameMaxChars)
              }
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.18)]}
            />
            <ChartTooltip
              offset={CHART_TOOLTIP_OFFSET}
              allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, _name, item) => {
                    const name = String(
                      (item?.payload as AnalysisRankedItem | undefined)?.name ??
                        "",
                    );
                    const spend = Number(
                      (item?.payload as AnalysisRankedItem | undefined)
                        ?.spend ?? 0,
                    );
                    return (
                      <div className="flex w-full flex-col gap-0.5">
                        {name ? (
                          <span className="font-medium">{name}</span>
                        ) : null}
                        <span>
                          {Number(value)} trip{Number(value) === 1 ? "" : "s"}
                        </span>
                        <span className="text-[var(--muted-foreground)]">
                          {formatMoney(spend, currency)}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[0, 4, 4, 0]}
              name="count"
            >
              <LabelList
                dataKey="count"
                position="right"
                className="fill-[var(--muted-foreground)] text-xs tabular-nums"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      {hasMore ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-[var(--muted-foreground)]"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll
            ? "Show less"
            : `Show more (${rows.length - RANKED_BAR_PREVIEW} more)`}
          <ChevronDownIcon
            className={`size-4 transition-transform ${showAll ? "rotate-180" : ""}`}
          />
        </Button>
      ) : null}
    </section>
  );
}

function NetLineChart({
  data,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const points = data.monthly.map((point) => ({
    ...point,
    net: Math.round((point.income - point.spend) * 100) / 100,
  }));
  const maxNet = Math.max(...points.map((point) => point.net), 0);
  const minNet = Math.min(...points.map((point) => point.net), 0);
  const splitAt =
    maxNet <= 0 ? 0 : minNet >= 0 ? 1 : maxNet / (maxNet - minNet);
  const config = {
    net: { label: "Net", color: "oklch(0.45 0.06 250)" },
  } satisfies ChartConfig;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title="Net cash flow"
        info="Income minus lifestyle spend. Internal transfers excluded so paying a credit card does not look like extra income or extra spend."
        actions={<PeriodViews value={period} onChange={onPeriodChange} />}
        csv={{
          headers: ["Period", "Net", "Income", "Spend"],
          rows: points.map((row) => [
            String(row.label ?? row.month ?? ""),
            row.net,
            Number(row.income ?? 0),
            Number(row.spend ?? 0),
          ]),
        }}
      />
      <ChartContainer
        config={config}
        className="aspect-[2.4/1] w-full"
        initialDimension={{ width: 640, height: 240 }}
      >
        <AreaChart
          data={points}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="net-cash-split" x1="0" y1="0" x2="0" y2="1">
              <stop offset={splitAt} stopColor="#86efac" />
              <stop offset={splitAt} stopColor="#fca5a5" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value) => moneyTick(Number(value), data.currency)}
          />
          <ReferenceLine y={0} stroke="#171717" strokeOpacity={0.28} />
          <ChartTooltip
            offset={CHART_TOOLTIP_OFFSET}
            allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
            content={
              <ChartTooltipContent
                formatter={(value) => formatMoney(Number(value), data.currency)}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="net"
            stroke="var(--color-net)"
            strokeWidth={2}
            fill="url(#net-cash-split)"
            fillOpacity={0.55}
            baseValue={0}
            dot={false}
            name="net"
          />
        </AreaChart>
      </ChartContainer>
      <TimeSeriesTable
        rows={points}
        columns={[{ key: "net", label: "Net" }]}
        currency={data.currency}
      />
    </section>
  );
}

function CategoryDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (category: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisCategoryBreakdown | undefined =
    data.breakdowns.find((item) => item.category === selected) ??
    data.breakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Category detail"
        info="Pick a category. Subcategories come from transaction labels. Merchants come from enrichment and entities."
      />
      <div className="flex flex-wrap gap-1">
        {data.breakdowns.map((item) => (
          <Button
            key={item.category}
            type="button"
            size="sm"
            variant={
              item.category === breakdown.category ? "default" : "outline"
            }
            onClick={() => onSelect(item.category)}
          >
            {item.category}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.category} subcategory mix`}
        info={`How ${breakdown.category} splits by subcategory over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.typeSeries}
        monthly={breakdown.typeMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title={`${breakdown.category} subcategories`}
          info="Finer labels under this category (Food Delivery, Gym Memberships, Code Editors)."
          rows={breakdown.types}
          currency={data.currency}
          color="oklch(0.52 0.1 155)"
        />
        <RankedBarChart
          title={`${breakdown.category} merchants`}
          info="Who took the money inside this category."
          rows={breakdown.merchants}
          currency={data.currency}
          color="oklch(0.55 0.12 35)"
          labelWidth={140}
        />
      </div>
    </section>
  );
}

const SEGMENTED_SCROLL_RATIO = 0.7;

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; desktopLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncOverflow();
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncOverflow, options]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (active) {
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < el.scrollLeft) {
        el.scrollTo({ left });
      } else if (right > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: right - el.clientWidth });
      }
    }
    syncOverflow();
  }, [value, syncOverflow]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * SEGMENTED_SCROLL_RATIO,
      behavior: "smooth",
    });
  };

  return (
    <div className="inline-flex w-full min-w-0 max-w-full items-stretch rounded-md border border-border p-0.5 sm:w-auto sm:flex-wrap sm:gap-0.5 sm:rounded-lg">
      {canLeft ? (
        <Arrows
          variant="ghost"
          shape="tower"
          size="sm"
          direction="left"
          aria-label={`Scroll ${ariaLabel} left`}
          className="h-11 w-8 sm:hidden"
          onClick={() => scrollByPage(-1)}
        />
      ) : null}
      <div className="relative min-w-0 flex-1">
        {canLeft ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent sm:hidden"
          />
        ) : null}
        {canRight ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent sm:hidden"
          />
        ) : null}
        <div
          ref={scrollerRef}
          role="group"
          aria-label={ariaLabel}
          onScroll={syncOverflow}
          className="inline-flex min-w-0 w-full overflow-x-auto overscroll-x-contain touch-pan-x gap-1 scrollbar-none sm:flex-wrap sm:gap-0.5"
        >
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="xs"
              variant={value === option.value ? "default" : "ghost"}
              className={cn(
                "h-11 min-w-11 shrink-0 px-3 text-sm font-normal sm:h-6 sm:min-w-0 sm:px-2 sm:text-xs",
                value === option.value && "pointer-events-none",
              )}
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value)}
            >
              {option.desktopLabel ? (
                <>
                  <span className="sm:hidden">{option.label}</span>
                  <span className="hidden sm:inline">
                    {option.desktopLabel}
                  </span>
                </>
              ) : (
                option.label
              )}
            </Button>
          ))}
        </div>
      </div>
      {canRight ? (
        <Arrows
          variant="ghost"
          shape="tower"
          size="sm"
          direction="right"
          aria-label={`Scroll ${ariaLabel} right`}
          className="h-11 w-8 sm:hidden"
          onClick={() => scrollByPage(1)}
        />
      ) : null}
    </div>
  );
}

type RankedTableUi = {
  openName: string | null;
  showAll: boolean;
};

const rankedTableUi = new Map<string, RankedTableUi>();

function useRankedTableUi(tableId: string) {
  const saved = rankedTableUi.get(tableId);
  const [openName, setOpenName] = useState<string | null>(
    () => saved?.openName ?? null,
  );
  const [showAll, setShowAll] = useState(() => saved?.showAll ?? false);

  useEffect(() => {
    rankedTableUi.set(tableId, { openName, showAll });
  }, [tableId, openName, showAll]);

  return { openName, setOpenName, showAll, setShowAll };
}

function FacetPaneShell({
  pane,
  onPaneChange,
  visualizations,
  summary,
  average,
  range,
}: {
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
  visualizations: ReactNode;
  summary: ReactNode;
  average: ReactNode;
  range: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <SegmentedControl
        ariaLabel="Facet view"
        options={FACET_PANE_OPTIONS}
        value={pane}
        onChange={onPaneChange}
      />
      {pane === "visualizations"
        ? visualizations
        : pane === "summary"
          ? summary
          : pane === "average"
            ? average
            : range}
    </div>
  );
}

function categoriesForSection(
  stacked: AnalysisStackedRankedBreakdown | undefined,
  sectionName: string,
) {
  if (!stacked) return [];
  const row = stacked.rows.find((item) => item.name === sectionName);
  if (!row) return [];
  const leftovers = stacked.otherByRow?.[sectionName] ?? [];
  const leftoverSet = new Set(leftovers.map((item) => item.name));
  const named = stacked.series
    .filter((series) => series.key !== "other")
    .map((series) => ({
      name: series.label,
      spend: Number(row[series.key] ?? 0),
      count: 0,
    }))
    .filter((item) => item.spend > 0 && !leftoverSet.has(item.name));
  return [...named, ...leftovers].sort((a, b) => b.spend - a.spend);
}

function vendorsRecord(
  entries: Array<{ name: string; vendors: AnalysisRankedItem[] }>,
) {
  const next: Record<string, AnalysisRankedItem[]> = {};
  for (const entry of entries) {
    next[entry.name] = entry.vendors.slice(0, 10);
  }
  return next;
}

function txnPeekKey(facet: string, ...parts: string[]) {
  return `${facet}:${parts.join("::")}`;
}

const txnPeekIndexCache = new WeakMap<
  AnalysisData,
  Map<string, AnalysisTxnPeek[]>
>();

function txnPeekIndex(data: AnalysisData) {
  let index = txnPeekIndexCache.get(data);
  if (!index) {
    index = new Map();
    for (const entry of data.txnPeeks ?? []) {
      index.set(entry.key, entry.peeks);
    }
    txnPeekIndexCache.set(data, index);
  }
  return index;
}

function peeksFor(
  data: AnalysisData,
  facet: string,
  ...parts: string[]
): AnalysisTxnPeek[] {
  return txnPeekIndex(data).get(txnPeekKey(facet, ...parts)) ?? [];
}

function sortTxnPeeks(peeks: AnalysisTxnPeek[]) {
  return peeks
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function mergeTxnPeeks(groups: AnalysisTxnPeek[][]) {
  const seen = new Set<string>();
  const merged: AnalysisTxnPeek[] = [];
  for (const group of groups) {
    for (const txn of group) {
      const id = `${txn.date}\0${txn.description}\0${txn.amount}`;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(txn);
      if (merged.length >= 48) return sortTxnPeeks(merged);
    }
  }
  return sortTxnPeeks(merged);
}

function rowPeeksWithVendorFallback(
  rowPeeks: AnalysisTxnPeek[],
  vendorPeeks: AnalysisTxnPeek[],
) {
  if (rowPeeks.length > 0) return rowPeeks;
  return vendorPeeks;
}

function txnPeekCountLabel(count: number) {
  const plus = count >= 48 ? "+" : "";
  const noun = count === 1 ? "txn" : "txns";
  return `${count}${plus} ${noun}`;
}

function classificationBlurb(
  catalog:
    | {
        sections: Array<{ name: string; description: string }>;
        categories: Array<{ name: string; description: string }>;
        subcategories: Array<{ name: string; description: string }>;
      }
    | undefined,
  nameLabel: string,
  name: string,
) {
  const facet =
    nameLabel === "Section"
      ? "section"
      : nameLabel === "Category"
        ? "category"
        : nameLabel === "Subcategory"
          ? "subcategory"
          : null;
  if (!facet) return null;
  const rows =
    facet === "section"
      ? catalog?.sections
      : facet === "category"
        ? catalog?.categories
        : catalog?.subcategories;
  const match = rows?.find(
    (row) => row.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  const fromCatalog = match?.description.trim();
  if (fromCatalog) return fromCatalog;
  return taxonomyDescription(facet, name);
}

function TxnPeekRows({
  transactions,
  currency,
  onEditDescription,
  hideRowMenu = false,
}: {
  transactions: AnalysisTxnPeek[];
  currency: string;
  onEditDescription: (description: string) => void;
  hideRowMenu?: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        No transactions in this range.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <tbody>
          {transactions.map((txn, index) => {
            const isCredit = txn.amount < 0;
            return (
              <tr
                key={`${txn.date}-${txn.description}-${index}`}
                className="border-b border-border last:border-b-0"
              >
                {hideRowMenu ? null : (
                  <td className="w-8 px-1 py-1 align-top">
                    <DescriptionActionsButton
                      description={txn.description}
                      onEdit={onEditDescription}
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-1.5 align-top tabular-nums text-muted-foreground">
                  {formatShortDisplayDate(txn.date)}
                </td>
                <td className="max-w-[12rem] px-2 py-1.5 align-top text-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block truncate">{txn.description}</span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={6}
                      className="z-[60] max-w-sm text-left leading-snug"
                    >
                      {txn.description}
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right align-top">
                  <MoneyText
                    amount={Math.abs(txn.amount)}
                    currency={currency}
                  />
                </td>
                <td className="px-3 py-1.5 text-right align-top">
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      isCredit ? "text-foreground" : "text-muted-foreground"
                    }`}
                    aria-label={isCredit ? "Credit" : "Debit"}
                  >
                    {isCredit ? "CR" : "DR"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowTxnsPopover({
  label,
  nameLabel,
  currency,
  transactions,
  canMoveMerchant = false,
}: {
  label: string;
  nameLabel: string;
  currency: string;
  transactions: AnalysisTxnPeek[];
  canMoveMerchant?: boolean;
}) {
  const catalog = useQuery(api.classifications.list, {});
  const [open, setOpen] = useState(false);
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const nestedOpen = editDescription != null || moveOpen;
  const blurb = classificationBlurb(catalog, nameLabel, label);
  const countLabel = txnPeekCountLabel(transactions.length);

  const trigger = (
    <button
      type="button"
      aria-label={`Transactions for ${label}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-accent hover:text-primary sm:size-6"
    >
      <IconInfoCircle className="size-3.5" />
    </button>
  );

  const headerActions = canMoveMerchant ? (
    <RowActionsMenu
      label={label}
      size="sm"
      actions={[
        {
          label: "Move",
          onSelect: () => setMoveOpen(true),
        },
      ]}
    />
  ) : null;

  const titleRow = (
    <div className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 font-normal text-muted-foreground">
        {countLabel}
      </span>
    </div>
  );

  const blurbRow = blurb ? (
    <p className="mt-1 text-sm font-normal text-muted-foreground">{blurb}</p>
  ) : null;

  const list = (
    <TxnPeekRows
      transactions={transactions}
      currency={currency}
      onEditDescription={setEditDescription}
    />
  );

  const nestedDialogs = (
    <>
      <EditDescriptionDialog
        open={editDescription != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditDescription(null);
        }}
        currentDescription={editDescription ?? ""}
      />
      {canMoveMerchant ? (
        <MoveMerchantDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          merchantName={label}
        />
      ) : null}
    </>
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && nestedOpen) return;
          setOpen(next);
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          minimizeLabel={label}
          onInteractOutside={(event) => {
            keepTxnPeekPopoverOpen(event);
          }}
        >
          <DialogHeader className="flex flex-row items-start justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <DialogTitle className="text-sm">{titleRow}</DialogTitle>
              {blurbRow}
              <DialogDescription className="sr-only">
                Recent transactions for {label} in this range.
              </DialogDescription>
            </div>
            {headerActions}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">{list}</div>
        </DialogContent>
      </Dialog>
      {nestedDialogs}
    </>
  );
}

function addVendorToStoreSheet(
  addRow: ReturnType<typeof useScratchNoteActions>["addRow"],
  input: Parameters<ReturnType<typeof useScratchNoteActions>["addRow"]>[0],
) {
  toastCompact.success(`Added ${input.name} to store sheet`);
  void addRow(input).catch(() =>
    toastCompact.error("Could not add to store sheet"),
  );
}

function LeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  totalSpend,
  vendorsByRow,
  transactionsForRow,
  transactionsForVendor,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  totalSpend: number;
  vendorsByRow?: Record<string, AnalysisRankedItem[]>;
  transactionsForRow?: (rowName: string) => AnalysisTxnPeek[];
  transactionsForVendor?: (
    rowName: string,
    vendorName: string,
  ) => AnalysisTxnPeek[];
}) {
  const { openName, setOpenName } = useRankedTableUi(title);
  const { addRow } = useScratchNoteActions();
  const top = rows.slice(0, 10);
  const topTotal = top.reduce((sum, row) => sum + row.spend, 0);
  const topCount = top.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const canExpand = Boolean(vendorsByRow);
  const showTxns = Boolean(transactionsForRow);
  const asMerchant = isMerchantNameLabel(nameLabel);
  const gridCols = canExpand
    ? showTxns
      ? "grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem_1rem_2.75rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem_1rem_1.5rem]"
      : "grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem_1rem]"
    : showTxns
      ? "grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem_2.75rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem_1.5rem]"
      : "grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem]";
  const grid = `grid min-w-0 w-full items-center gap-x-3 px-3 ${gridCols}`;
  const rankCol = "flex h-5 w-full items-center justify-center";

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        csv={{
          headers: [nameLabel, "Spend", "Count", "Share %"],
          rows: rows.map((row) => [
            row.name,
            row.spend,
            row.count ?? 0,
            totalSpend > 0
              ? Math.round((row.spend / totalSpend) * 10000) / 100
              : 0,
          ]),
        }}
      />
      {top.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nothing in this range.
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--border)]">
          <div
            className={`${grid} border-b border-[var(--border)] py-2 text-xs text-[var(--muted-foreground)]`}
          >
            <span className={`${rankCol} tabular-nums`}>#</span>
            <span className="min-w-0 truncate text-left">{nameLabel}</span>
            <span className="w-full text-left">Spend</span>
            <span className="w-full text-right">Count</span>
            <span className="w-full text-left">Share</span>
            {canExpand ? <span /> : null}
            {showTxns ? <span className="sr-only">Info</span> : null}
          </div>
          <div>
            {top.map((row, index) => {
              const vendors = vendorsByRow?.[row.name] ?? [];
              const isOpen = canExpand && openName === row.name;
              const txnCell = showTxns ? (
                <RowTxnsPopover
                  label={row.name}
                  nameLabel={nameLabel}
                  currency={currency}
                  canMoveMerchant={asMerchant}
                  transactions={rowPeeksWithVendorFallback(
                    transactionsForRow?.(row.name) ?? [],
                    mergeTxnPeeks(
                      vendors.map(
                        (vendor) =>
                          transactionsForVendor?.(row.name, vendor.name) ?? [],
                      ),
                    ),
                  )}
                />
              ) : null;
              const mainCells = (
                <>
                  <span
                    className={`${rankCol} text-[var(--muted-foreground)] tabular-nums`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-left font-medium">
                    {asMerchant ? <MerchantLabel name={row.name} /> : row.name}
                  </span>
                  <span className="text-left font-mono text-sm tabular-nums">
                    <MoneyText
                      amount={row.spend}
                      currency={currency}
                      align="left"
                    />
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums text-[var(--muted-foreground)]">
                    {formatCount(row.count ?? 0)}
                  </span>
                  <span className="text-left font-mono text-sm tabular-nums text-[var(--muted-foreground)]">
                    {formatShare(row.spend, totalSpend)}
                  </span>
                  {canExpand ? (
                    <ChevronDownIcon
                      className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  ) : null}
                </>
              );
              return (
                <div
                  key={row.name}
                  className="not-last:border-b border-[var(--border)]"
                >
                  <div className={`${grid} py-2.5 text-sm`}>
                    {canExpand ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenName((current) =>
                            current === row.name ? null : row.name,
                          )
                        }
                        className="contents text-left"
                      >
                        {mainCells}
                      </button>
                    ) : (
                      mainCells
                    )}
                    {txnCell}
                  </div>
                  {isOpen ? (
                    vendors.length === 0 ? (
                      <p
                        className={`${grid} pb-2.5 text-sm text-[var(--muted-foreground)]`}
                      >
                        <span />
                        <span className="col-span-4">None in this range.</span>
                      </p>
                    ) : (
                      <div className="pb-2">
                        {vendors.map((vendor) => (
                          <div
                            key={vendor.name}
                            className={`${grid} py-1 text-sm`}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Add ${vendor.name} to store sheet`}
                                  className={`${rankCol} rounded text-accent hover:bg-accent-subtle hover:text-accent`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    addVendorToStoreSheet(addRow, {
                                      name: vendor.name,
                                      spend: vendor.spend,
                                      count: vendor.count ?? 0,
                                      currency,
                                      parent: row.name,
                                    });
                                  }}
                                >
                                  <PlusIcon
                                    className="size-3.5"
                                    strokeWidth={2}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                sideOffset={6}
                                className="z-[60] text-left leading-snug"
                              >
                                {`Add ${vendor.name} to store sheet`}
                              </TooltipContent>
                            </Tooltip>
                            <span className="min-w-0 truncate text-[var(--muted-foreground)]">
                              <MerchantLabel name={vendor.name} />
                            </span>
                            <span className="text-left font-mono tabular-nums">
                              <MoneyText
                                amount={vendor.spend}
                                currency={currency}
                                align="left"
                              />
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {formatCount(vendor.count ?? 0)}
                            </span>
                            <span className="text-left font-mono tabular-nums text-[var(--muted-foreground)]">
                              {formatShare(vendor.spend, row.spend)}
                            </span>
                            {canExpand ? <span /> : null}
                            {showTxns ? (
                              <RowTxnsPopover
                                label={vendor.name}
                                nameLabel="Merchant"
                                currency={currency}
                                canMoveMerchant
                                transactions={
                                  transactionsForVendor?.(
                                    row.name,
                                    vendor.name,
                                  ) ?? []
                                }
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
          <div
            className={`${grid} border-t border-[var(--border)] py-2 text-sm font-medium`}
          >
            <span />
            <span className="min-w-0 truncate">Top {top.length}</span>
            <span className="text-left font-mono tabular-nums">
              <MoneyText amount={topTotal} currency={currency} align="left" />
            </span>
            <span className="text-right font-mono tabular-nums">
              {topCount}
            </span>
            <span className="text-left font-mono tabular-nums">
              {formatShare(topTotal, totalSpend)}
            </span>
            {canExpand ? <span /> : null}
            {showTxns ? <span /> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function formatAvgCount(value: number) {
  if (Math.abs(value) < 0.05) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  });
}

function formatCount(value: number) {
  return value === 0 ? "-" : String(value);
}

/** High / median / low across period buckets that had spend (> 0). */
function periodSpendRangeFromValues(values: number[]) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { high: 0, mid: 0, low: 0 };
  const high = sorted[sorted.length - 1] ?? 0;
  const low = sorted[0] ?? 0;
  const midAt = Math.floor(sorted.length / 2);
  const mid =
    sorted.length % 2 === 0
      ? ((sorted[midAt - 1] ?? 0) + (sorted[midAt] ?? 0)) / 2
      : (sorted[midAt] ?? 0);
  return { high, mid, low };
}

function periodSpendRange(
  monthly: Array<Record<string, string | number>>,
  key: string,
) {
  return periodSpendRangeFromValues(
    monthly.map((row) => Number(row[key] ?? 0)),
  );
}

function periodSpendRangeFromOther(
  otherByPeriod: Record<string, AnalysisRankedItem[]> | undefined,
  name: string,
) {
  if (!otherByPeriod) return { high: 0, mid: 0, low: 0 };
  return periodSpendRangeFromValues(
    Object.values(otherByPeriod).map(
      (items) => items.find((item) => item.name === name)?.spend ?? 0,
    ),
  );
}

function seriesKeyForLabel(name: string, series: AnalysisCategorySeries[]) {
  return series.find((item) => item.label === name)?.key;
}

/** High / mid / low spend across header range period buckets. */
function RangeLeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  series,
  monthly,
  currency,
  otherByPeriod,
  transactionsForRow,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  series: AnalysisCategorySeries[];
  monthly: Array<Record<string, string | number>>;
  currency: string;
  otherByPeriod?: Record<string, AnalysisRankedItem[]>;
  transactionsForRow?: (rowName: string) => AnalysisTxnPeek[];
}) {
  const asMerchant = isMerchantNameLabel(nameLabel);
  const showTxns = Boolean(transactionsForRow);
  const ranked = useMemo(() => {
    return rows
      .map((row) => {
        const key = seriesKeyForLabel(row.name, series);
        const stats = key
          ? periodSpendRange(monthly, key)
          : periodSpendRangeFromOther(otherByPeriod, row.name);
        return { name: row.name, spend: row.spend, ...stats };
      })
      .filter((row) => row.high > 0)
      .sort((a, b) => b.high - a.high || b.spend - a.spend);
  }, [rows, series, monthly, otherByPeriod]);
  const top = ranked.slice(0, 10);

  const grid = showTxns
    ? "grid w-fit max-w-full grid-cols-[1.5rem_minmax(7rem,14rem)_7.25rem_7.25rem_7.25rem_2.75rem] items-center gap-x-4 px-3 sm:grid-cols-[1.5rem_minmax(7rem,14rem)_7.25rem_7.25rem_7.25rem_1.5rem]"
    : "grid w-fit max-w-full grid-cols-[1.5rem_minmax(7rem,14rem)_7.25rem_7.25rem_7.25rem] items-center gap-x-4 px-3";

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        csv={{
          headers: [nameLabel, "High", "Mid", "Low"],
          rows: ranked.map((row) => [row.name, row.high, row.mid, row.low]),
        }}
      />
      {top.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nothing in this range.
        </p>
      ) : (
        <div className="w-fit max-w-full overflow-x-auto rounded-lg border border-[var(--border)]">
          <ScrollTopX className="rounded-lg">
            <div
              className={`${grid} border-b border-[var(--border)] py-2 text-xs text-[var(--muted-foreground)]`}
            >
              <span className="tabular-nums">#</span>
              <span className="min-w-0 truncate text-left">{nameLabel}</span>
              <span className="w-full text-right">High</span>
              <span className="w-full text-right">Mid</span>
              <span className="w-full text-right">Low</span>
              {showTxns ? <span className="sr-only">Info</span> : null}
            </div>
            <div>
              {top.map((row, index) => (
                <div
                  key={row.name}
                  className={`${grid} not-last:border-b border-[var(--border)] py-2.5 text-sm`}
                >
                  <span className="text-[var(--muted-foreground)] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate font-medium text-[var(--foreground)]">
                    {asMerchant ? <MerchantLabel name={row.name} /> : row.name}
                  </span>
                  <span className="text-right font-mono tabular-nums text-[var(--foreground)]">
                    <MoneyText amount={row.high} currency={currency} />
                  </span>
                  <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                    <MoneyText amount={row.mid} currency={currency} />
                  </span>
                  <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                    <MoneyText amount={row.low} currency={currency} />
                  </span>
                  {showTxns ? (
                    <RowTxnsPopover
                      label={row.name}
                      nameLabel={nameLabel}
                      currency={currency}
                      canMoveMerchant={asMerchant}
                      transactions={transactionsForRow?.(row.name) ?? []}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollTopX>
        </div>
      )}
    </section>
  );
}

/** Like Summary, but spend/count divided by header period buckets. */
function AverageLeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  period,
  periodCount,
  vendorsByRow,
  transactionsForRow,
  transactionsForVendor,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  period: AnalysisPeriod;
  periodCount: number;
  vendorsByRow?: Record<string, AnalysisRankedItem[]>;
  transactionsForRow?: (rowName: string) => AnalysisTxnPeek[];
  transactionsForVendor?: (
    rowName: string,
    vendorName: string,
  ) => AnalysisTxnPeek[];
}) {
  const { openName, setOpenName, showAll, setShowAll } =
    useRankedTableUi(title);
  const { addRow } = useScratchNoteActions();
  const meta = ANALYSIS_PERIOD_META[period];
  const divisor = Math.max(periodCount, 1);
  const hasMore = rows.length > 10;
  const visible = showAll ? rows : rows.slice(0, 10);
  const visibleAvgCost =
    visible.reduce((sum, row) => sum + row.spend, 0) / divisor;
  const visibleAvgCount =
    visible.reduce((sum, row) => sum + (row.count ?? 0), 0) / divisor;
  const canExpand = Boolean(vendorsByRow);
  const showTxns = Boolean(transactionsForRow);
  const asMerchant = isMerchantNameLabel(nameLabel);
  const gridCols = canExpand
    ? showTxns
      ? "grid-cols-[1.15rem_minmax(0,1fr)_6.5rem_4rem_1rem_2.75rem] sm:grid-cols-[1.15rem_minmax(0,1fr)_6.5rem_4rem_1rem_1.5rem]"
      : "grid-cols-[1.15rem_minmax(0,1fr)_6.5rem_4rem_1rem]"
    : showTxns
      ? "grid-cols-[1.15rem_minmax(0,1fr)_6.5rem_4rem_2.75rem] sm:grid-cols-[1.15rem_minmax(0,1fr)_6.5rem_4rem_1.5rem]"
      : "grid-cols-[1.15rem_minmax(0,1fr)_6.5rem_4rem]";
  const grid = `grid min-w-0 w-full items-center gap-x-2 px-2 sm:gap-x-3 sm:px-3 ${gridCols}`;
  const rankCol = "flex h-5 w-full items-center justify-center text-xs";

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface-elevated p-3 sm:space-y-4 sm:p-6">
      <ChartTitle
        title={title}
        info={info}
        csv={{
          headers: [nameLabel, meta.avgCostLabel, meta.avgCountLabel],
          rows: rows.map((row) => [
            row.name,
            Math.round((row.spend / divisor) * 100) / 100,
            Math.round(((row.count ?? 0) / divisor) * 100) / 100,
          ]),
        }}
      />
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nothing in this range.
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--border)]">
          <div
            className={`${grid} border-b border-[var(--border)] py-2 text-xs text-[var(--muted-foreground)]`}
          >
            <span className={`${rankCol} tabular-nums`}>#</span>
            <span className="min-w-0 truncate text-left">{nameLabel}</span>
            <span className="w-full whitespace-nowrap text-right">
              {meta.avgCostLabel}
            </span>
            <span className="w-full whitespace-nowrap text-right">
              {meta.avgCountLabel}
            </span>
            {canExpand ? <span /> : null}
            {showTxns ? <span className="sr-only">Info</span> : null}
          </div>
          <div>
            {visible.map((row, index) => {
              const vendors = vendorsByRow?.[row.name] ?? [];
              const isOpen = canExpand && openName === row.name;
              const avgCost = row.spend / divisor;
              const avgCount = (row.count ?? 0) / divisor;
              const mainCells = (
                <>
                  <span
                    className={`${rankCol} text-[var(--muted-foreground)] tabular-nums`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-left font-medium">
                    {asMerchant ? <MerchantLabel name={row.name} /> : row.name}
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums">
                    <MoneyText
                      amount={avgCost}
                      currency={currency}
                      showSymbol={false}
                    />
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums text-[var(--muted-foreground)]">
                    {formatAvgCount(avgCount)}
                  </span>
                  {canExpand ? (
                    <ChevronDownIcon
                      className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  ) : null}
                </>
              );
              return (
                <div
                  key={row.name}
                  className="not-last:border-b border-[var(--border)]"
                >
                  <div className={`${grid} py-2.5 text-sm`}>
                    {canExpand ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenName((current) =>
                            current === row.name ? null : row.name,
                          )
                        }
                        className="contents text-left"
                      >
                        {mainCells}
                      </button>
                    ) : (
                      mainCells
                    )}
                    {showTxns ? (
                      <RowTxnsPopover
                        label={row.name}
                        nameLabel={nameLabel}
                        currency={currency}
                        canMoveMerchant={asMerchant}
                        transactions={rowPeeksWithVendorFallback(
                          transactionsForRow?.(row.name) ?? [],
                          mergeTxnPeeks(
                            vendors.map(
                              (vendor) =>
                                transactionsForVendor?.(
                                  row.name,
                                  vendor.name,
                                ) ?? [],
                            ),
                          ),
                        )}
                      />
                    ) : null}
                  </div>
                  {isOpen ? (
                    vendors.length === 0 ? (
                      <p
                        className={`${grid} pb-2.5 text-sm text-[var(--muted-foreground)]`}
                      >
                        <span />
                        <span className="col-span-3">No vendors listed.</span>
                        <span />
                      </p>
                    ) : (
                      <div className="pb-2">
                        {vendors.slice(0, 8).map((vendor) => (
                          <div
                            key={vendor.name}
                            className={`${grid} py-1 text-sm`}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Add ${vendor.name} to store sheet`}
                                  className={`${rankCol} rounded text-accent hover:bg-accent-subtle hover:text-accent`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    addVendorToStoreSheet(addRow, {
                                      name: vendor.name,
                                      spend: vendor.spend / divisor,
                                      count: vendor.count ?? 0,
                                      currency,
                                      parent: row.name,
                                    });
                                  }}
                                >
                                  <PlusIcon
                                    className="size-3.5"
                                    strokeWidth={2}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                sideOffset={6}
                                className="z-[60] text-left leading-snug"
                              >
                                {`Add ${vendor.name} to store sheet`}
                              </TooltipContent>
                            </Tooltip>
                            <span className="min-w-0 truncate text-[var(--muted-foreground)]">
                              <MerchantLabel name={vendor.name} />
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              <MoneyText
                                amount={vendor.spend / divisor}
                                currency={currency}
                                showSymbol={false}
                              />
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {formatAvgCount((vendor.count ?? 0) / divisor)}
                            </span>
                            {canExpand ? <span /> : null}
                            {showTxns ? (
                              <RowTxnsPopover
                                label={vendor.name}
                                nameLabel="Merchant"
                                currency={currency}
                                canMoveMerchant
                                transactions={
                                  transactionsForVendor?.(
                                    row.name,
                                    vendor.name,
                                  ) ?? []
                                }
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
          <div
            className={`${grid} border-t border-[var(--border)] py-2 text-sm font-medium`}
          >
            <span />
            <span className="min-w-0 truncate">
              {showAll ? `All ${visible.length}` : `Top ${visible.length}`}
            </span>
            <span className="text-right font-mono tabular-nums">
              <MoneyText
                amount={visibleAvgCost}
                currency={currency}
                showSymbol={false}
              />
            </span>
            <span className="text-right font-mono tabular-nums">
              {formatAvgCount(visibleAvgCount)}
            </span>
            {canExpand ? <span /> : null}
            {showTxns ? <span /> : null}
          </div>
        </div>
      )}
      {hasMore ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-[var(--muted-foreground)]"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Show less" : `Show more (${rows.length - 10} more)`}
          <ChevronDownIcon
            className={`size-4 transition-transform ${showAll ? "rotate-180" : ""}`}
          />
        </Button>
      ) : null}
    </section>
  );
}

function MainTab({
  data,
  period,
  onPeriodChange,
  onSelectCategory,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  onSelectCategory: (name: string) => void;
}) {
  const periodMeta = ANALYSIS_PERIOD_META[period];
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <Stat
          label="Lifestyle spending"
          value={formatMoney(data.summary.totalSpend, data.currency)}
          info={`${data.summary.spendCount} purchase rows, net of ${formatMoney(data.summary.refunds, data.currency)} refunds.`}
        />
        <Stat
          label="Income"
          value={formatMoney(data.summary.totalIncome, data.currency)}
          info="Payroll, cashback, and e-transfers in. Card payment credits on the visa are not income."
        />
        <Stat
          label="Transactions"
          value={String(
            data.summary.transactionCount ?? data.transactionCount ?? 0,
          )}
          info="All ledger rows in this date range (spend, income, transfers, and the rest)."
        />
        <Stat
          label={periodMeta.txnRateLabel}
          value={(data.summary.transactionsPerPeriod ?? 0).toLocaleString(
            undefined,
            {
              maximumFractionDigits: 1,
            },
          )}
          info={`Transaction count divided by ${periodMeta.nounPlural} in this range (same buckets as the ${periodMeta.label.toLowerCase()} charts).`}
        />
        <Stat
          label={periodMeta.incomeRateLabel}
          value={formatMoney(data.summary.incomePerPeriod ?? 0, data.currency)}
          info={`Income divided by ${periodMeta.nounPlural} in this range (same buckets as the ${periodMeta.label.toLowerCase()} charts).`}
        />
        <Stat
          label={periodMeta.avgLabel}
          value={formatMoney(data.summary.avgPeriodSpend, data.currency)}
          info={`Lifestyle spend divided by ${periodMeta.nounPlural} that had spend.`}
        />
        <Stat
          label={periodMeta.peakLabel}
          value={
            data.summary.peakSpendPeriod
              ? formatMoney(data.summary.peakSpendAmount, data.currency)
              : "-"
          }
          info={
            data.summary.peakSpendPeriod
              ? `Highest lifestyle spend: ${data.summary.peakSpendPeriod}.`
              : "No spend in this range."
          }
        />
        <Stat
          label="Internal transfers"
          value={formatMoney(data.summary.internalTransfers, data.currency)}
          info={`${data.summary.transferCount} paying-side moves. ${formatMoney(data.summary.inboundTransfersIgnored, data.currency)} in matching credits on cards/LOC left out so the same payoff is not counted twice.`}
        />
      </section>

      <TrendChart data={data} period={period} onPeriodChange={onPeriodChange} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title="Top spending categories"
          info="Net spend after refunds. Card payoffs stay out. Remittances and e-transfers to people stay in. Click a bar to open that category on the Categories tab."
          rows={data.categories.slice(0, 10)}
          currency={data.currency}
          onSelect={onSelectCategory}
        />
        <NetLineChart
          data={data}
          period={period}
          onPeriodChange={onPeriodChange}
        />
      </div>
    </div>
  );
}

function SectionsTab({
  data,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const total = data.summary.totalSpend;
  const periodCount = Math.max(data.monthly.length, 1);
  const periodMeta = ANALYSIS_PERIOD_META[period];

  if (data.sections.length === 0) {
    return (
      <EmptyPrompt
        title="No sections in this range"
        description="Create sections, then assign them on transactions."
        href="/classifications?tab=sections&create=1"
        actionLabel="Create section"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Section breakdown"
            info="Each section bar splits by its biggest categories. The last 15% of that section rolls into Other. Hover Other to see the names."
            rows={data.sectionStacked.rows}
            series={data.sectionStacked.series}
            currency={data.currency}
            labelWidth={120}
            otherByRow={data.sectionStacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Section mix over time"
            info={`${ANALYSIS_PERIOD_META[period].label} lifestyle spend by taxonomy section. Named bands are the first 85%. The last 15% is Other.`}
            series={data.sectionSeries}
            monthly={data.sectionMonthly}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.sectionOther}
            otherByPeriod={data.sectionOtherByPeriod}
          />
          <TaxonomyBreakdownTable
            title="All sections"
            info="Every section in this range with spend, share of lifestyle outflow, and top categories inside each section."
            nameLabel="Section"
            rows={data.sections}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top categories"
            stacked={data.sectionStacked}
          />
        </div>
      }
      summary={
        <div className="grid gap-6 lg:grid-cols-2">
          <LeaderboardTable
            title="Top sections"
            info="Biggest taxonomy sections by lifestyle spend. Click a row to see the vendors inside."
            nameLabel="Section"
            rows={data.sections}
            currency={data.currency}
            totalSpend={total}
            vendorsByRow={data.merchantsBySection}
            transactionsForRow={(name) => peeksFor(data, "section", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "section-merchant", row, vendor)
            }
          />
          {data.sections.map((section) => (
            <LeaderboardTable
              key={section.name}
              title={`Top ${section.name} categories`}
              info={`Biggest categories inside ${section.name}. Share is of that section. Click a row to see the vendors inside.`}
              nameLabel="Category"
              rows={data.categoriesBySection?.[section.name] ?? []}
              currency={data.currency}
              totalSpend={section.spend}
              vendorsByRow={data.merchantsByCategory}
              transactionsForRow={(name) =>
                peeksFor(data, "section-category", section.name, name)
              }
              transactionsForVendor={(row, vendor) =>
                peeksFor(data, "category-merchant", row, vendor)
              }
            />
          ))}
        </div>
      }
      average={
        <div className="grid gap-6 lg:grid-cols-2">
          <AverageLeaderboardTable
            title="Average by section"
            info={`Total spend and transaction count for each section, divided by ${periodCount} ${periodMeta.nounPlural} in this range (same buckets as the ${periodMeta.label.toLowerCase()} charts).`}
            nameLabel="Section"
            rows={data.sections}
            currency={data.currency}
            period={period}
            periodCount={periodCount}
            vendorsByRow={data.merchantsBySection}
            transactionsForRow={(name) => peeksFor(data, "section", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "section-merchant", row, vendor)
            }
          />
          {data.sections.map((section) => (
            <AverageLeaderboardTable
              key={section.name}
              title={`Average ${section.name} categories`}
              info={`Category averages inside ${section.name}, per ${periodMeta.noun}.`}
              nameLabel="Category"
              rows={data.categoriesBySection?.[section.name] ?? []}
              currency={data.currency}
              period={period}
              periodCount={periodCount}
              vendorsByRow={data.merchantsByCategory}
              transactionsForRow={(name) =>
                peeksFor(data, "section-category", section.name, name)
              }
              transactionsForVendor={(row, vendor) =>
                peeksFor(data, "category-merchant", row, vendor)
              }
            />
          ))}
        </div>
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by section"
          info={`Highest, median, and lowest ${periodMeta.label.toLowerCase()} spend for each section inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Section"
          rows={data.sections}
          series={data.sectionSeries}
          monthly={data.sectionMonthly}
          currency={data.currency}
          otherByPeriod={data.sectionOtherByPeriod}
          transactionsForRow={(name) => peeksFor(data, "section", name)}
        />
      }
    />
  );
}

function SpreadsTab({
  data,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const total = data.summary.totalSpend;
  const periodCount = Math.max(data.monthly.length, 1);
  const periodMeta = ANALYSIS_PERIOD_META[period];

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Spread breakdown"
            info="Income plus Needs / Wants / Savings bars, each split by their biggest categories. The last 15% of that spread rolls into Other. Hover Other to see the names."
            rows={data.spreadStacked.rows}
            series={data.spreadStacked.series}
            currency={data.currency}
            labelWidth={100}
            otherByRow={data.spreadStacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Spread mix over time"
            info={`${ANALYSIS_PERIOD_META[period].label} mix: Needs + Wants + Savings spend, plus Surplus (income minus those three). Surplus is money earned and not spent in the 50/30/20 buckets.`}
            series={data.spreadSeries}
            monthly={data.spreadMonthly}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.spreadOther}
            otherByPeriod={data.spreadOtherByPeriod}
          />
          <TaxonomyBreakdownTable
            title="All spreads"
            info="Income plus Needs (50%), Wants (30%), and Savings (20%) in this range. Spend share is of lifestyle outflow; Income is absolute inflows."
            nameLabel="Spread"
            rows={data.spreads}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top categories"
            stacked={data.spreadStacked}
          />
        </div>
      }
      summary={
        <div className="grid gap-6 lg:grid-cols-2">
          <LeaderboardTable
            title="Top spreads"
            info="Income and 50/30/20 buckets by amount. Click a row to see the vendors inside."
            nameLabel="Spread"
            rows={data.spreads}
            currency={data.currency}
            totalSpend={total}
            vendorsByRow={data.merchantsBySpread}
            transactionsForRow={(name) => peeksFor(data, "spread", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "spread-merchant", row, vendor)
            }
          />
          {data.spreads.map((spread) => (
            <LeaderboardTable
              key={spread.name}
              title={`Top ${spread.name} categories`}
              info={`Biggest categories inside ${spread.name}. Share is of that spread. Click a row to see the vendors inside.`}
              nameLabel="Category"
              rows={data.categoriesBySpread?.[spread.name] ?? []}
              currency={data.currency}
              totalSpend={spread.spend}
              vendorsByRow={data.merchantsByCategory}
              transactionsForRow={(name) =>
                peeksFor(data, "spread-category", spread.name, name)
              }
              transactionsForVendor={(row, vendor) =>
                peeksFor(data, "category-merchant", row, vendor)
              }
            />
          ))}
        </div>
      }
      average={
        <div className="grid gap-6 lg:grid-cols-2">
          <AverageLeaderboardTable
            title="Average by spread"
            info={`Total amount and transaction count for each spread (Income + Needs / Wants / Savings), divided by ${periodCount} ${periodMeta.nounPlural} in this range (same buckets as the ${periodMeta.label.toLowerCase()} charts).`}
            nameLabel="Spread"
            rows={data.spreads}
            currency={data.currency}
            period={period}
            periodCount={periodCount}
            vendorsByRow={data.merchantsBySpread}
            transactionsForRow={(name) => peeksFor(data, "spread", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "spread-merchant", row, vendor)
            }
          />
          {data.spreads.map((spread) => (
            <AverageLeaderboardTable
              key={spread.name}
              title={`Average ${spread.name} categories`}
              info={`Category averages inside ${spread.name}, per ${periodMeta.noun}.`}
              nameLabel="Category"
              rows={data.categoriesBySpread?.[spread.name] ?? []}
              currency={data.currency}
              period={period}
              periodCount={periodCount}
              vendorsByRow={data.merchantsByCategory}
              transactionsForRow={(name) =>
                peeksFor(data, "spread-category", spread.name, name)
              }
              transactionsForVendor={(row, vendor) =>
                peeksFor(data, "category-merchant", row, vendor)
              }
            />
          ))}
        </div>
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by spread"
          info={`Highest, median, and lowest ${periodMeta.label.toLowerCase()} amount for Needs, Wants, Savings, and Surplus (income − those three) inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Spread"
          rows={[
            ...data.spreads,
            ...(() => {
              const totalSurplus = data.spreadMonthly.reduce(
                (sum, row) => sum + Number(row.surplus ?? 0),
                0,
              );
              return totalSurplus > 0
                ? [{ name: "Surplus", spend: totalSurplus, count: 0 }]
                : [];
            })(),
          ]}
          series={data.spreadSeries}
          monthly={data.spreadMonthly}
          currency={data.currency}
          otherByPeriod={data.spreadOtherByPeriod}
          transactionsForRow={(name) =>
            name === "Surplus" ? [] : peeksFor(data, "spread", name)
          }
        />
      }
    />
  );
}

function CategoriesTab({
  data,
  category,
  onSelectCategory,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  category: string;
  onSelectCategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const total = data.summary.totalSpend;
  const periodCount = Math.max(data.monthly.length, 1);
  const periodMeta = ANALYSIS_PERIOD_META[period];
  const merchantsBySubcategory = vendorsRecord(
    (data.subcategoryBreakdowns ?? []).map((item) => ({
      name: item.subcategory,
      vendors: item.merchants,
    })),
  );

  if (data.categories.length === 0) {
    return (
      <EmptyPrompt
        title="No categories in this range"
        description="Create categories, then assign them on transactions."
        href="/classifications?tab=categories&create=1"
        actionLabel="Create category"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Category breakdown"
            info="Each category bar splits by its biggest subcategories. The last 15% of that category rolls into Other. Hover Other to see the names."
            rows={data.categoryStacked.rows}
            series={data.categoryStacked.series}
            currency={data.currency}
            labelWidth={160}
            onSelect={onSelectCategory}
            otherByRow={data.categoryStacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Category mix over time"
            info={`Stacked ${ANALYSIS_PERIOD_META[period].label.toLowerCase()} lifestyle spend. Named bands are the first 85%. The last 15% is Other.`}
            series={data.categorySeries}
            monthly={data.categoryMonthly}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.categoryOther}
            otherByPeriod={data.categoryOtherByPeriod}
          />
          <CategoryDrilldown
            data={data}
            selected={category}
            onSelect={onSelectCategory}
            period={period}
            onPeriodChange={onPeriodChange}
          />
          <TaxonomyBreakdownTable
            title="All categories"
            info="Every category in this range with spend, share of lifestyle outflow, and top subcategories inside each category."
            nameLabel="Category"
            rows={data.categories}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top subcategories"
            stacked={data.categoryStacked}
          />
        </div>
      }
      summary={
        <div className="grid gap-6 lg:grid-cols-2">
          <LeaderboardTable
            title="Top categories"
            info="Biggest categories by lifestyle spend. Click a row to see the vendors inside."
            nameLabel="Category"
            rows={data.categories}
            currency={data.currency}
            totalSpend={total}
            vendorsByRow={data.merchantsByCategory}
            transactionsForRow={(name) => peeksFor(data, "category", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "category-merchant", row, vendor)
            }
          />
          {data.categories.map((item) => {
            const rows =
              data.breakdowns.find((entry) => entry.category === item.name)
                ?.types ??
              categoriesForSection(data.categoryStacked, item.name);
            if (rows.length === 0) return null;
            return (
              <LeaderboardTable
                key={item.name}
                title={`Top ${item.name} subcategories`}
                info={`Biggest subcategories inside ${item.name}. Share is of that category. Click a row to see the vendors inside.`}
                nameLabel="Subcategory"
                rows={rows}
                currency={data.currency}
                totalSpend={item.spend}
                vendorsByRow={merchantsBySubcategory}
                transactionsForRow={(name) =>
                  peeksFor(data, "subcategory", name)
                }
                transactionsForVendor={(row, vendor) =>
                  peeksFor(data, "subcategory-merchant", row, vendor)
                }
              />
            );
          })}
        </div>
      }
      average={
        <div className="grid gap-6 lg:grid-cols-2">
          <AverageLeaderboardTable
            title="Average by category"
            info={`Total spend and transaction count for each category, divided by ${periodCount} ${periodMeta.nounPlural} in this range.`}
            nameLabel="Category"
            rows={data.categories}
            currency={data.currency}
            period={period}
            periodCount={periodCount}
            vendorsByRow={data.merchantsByCategory}
            transactionsForRow={(name) => peeksFor(data, "category", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "category-merchant", row, vendor)
            }
          />
          {data.categories.map((item) => {
            const rows =
              data.breakdowns.find((entry) => entry.category === item.name)
                ?.types ??
              categoriesForSection(data.categoryStacked, item.name);
            if (rows.length === 0) return null;
            return (
              <AverageLeaderboardTable
                key={item.name}
                title={`Average ${item.name} subcategories`}
                info={`Subcategory averages inside ${item.name}, per ${periodMeta.noun}.`}
                nameLabel="Subcategory"
                rows={rows}
                currency={data.currency}
                period={period}
                periodCount={periodCount}
                vendorsByRow={merchantsBySubcategory}
                transactionsForRow={(name) =>
                  peeksFor(data, "subcategory", name)
                }
                transactionsForVendor={(row, vendor) =>
                  peeksFor(data, "subcategory-merchant", row, vendor)
                }
              />
            );
          })}
        </div>
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by category"
          info={`Highest, median, and lowest ${periodMeta.label.toLowerCase()} spend for each category inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Category"
          rows={data.categories}
          series={data.categorySeries}
          monthly={data.categoryMonthly}
          currency={data.currency}
          otherByPeriod={data.categoryOtherByPeriod}
          transactionsForRow={(name) => peeksFor(data, "category", name)}
        />
      }
    />
  );
}

function SubcategoryDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (subcategory: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisSubcategoryBreakdown | undefined =
    data.subcategoryBreakdowns.find((item) => item.subcategory === selected) ??
    data.subcategoryBreakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Subcategory detail"
        info="Pick a subcategory. Merchants come from Merchant clean on each transaction."
      />
      <div className="flex flex-wrap gap-1">
        {data.subcategoryBreakdowns.map((item) => (
          <Button
            key={item.subcategory}
            type="button"
            size="sm"
            variant={
              item.subcategory === breakdown.subcategory ? "default" : "outline"
            }
            onClick={() => onSelect(item.subcategory)}
          >
            {item.subcategory}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.subcategory} merchant mix`}
        info={`How ${breakdown.subcategory} splits by Merchant clean over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.merchantSeries}
        monthly={breakdown.merchantMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.subcategory} merchants`}
        info="Merchant clean names inside this subcategory."
        rows={breakdown.merchants}
        currency={data.currency}
        color="oklch(0.55 0.12 35)"
        labelWidth={160}
      />
    </section>
  );
}

function SubcategoriesTab({
  data,
  subcategory,
  onSelectSubcategory,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  subcategory: string;
  onSelectSubcategory: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const stacked = data.subcategoryStacked ?? { rows: [], series: [] };
  const breakdowns = data.subcategoryBreakdowns ?? [];
  const total = data.summary.totalSpend;
  const periodCount = Math.max(data.monthly.length, 1);
  const periodMeta = ANALYSIS_PERIOD_META[period];
  const merchantsBySubcategory = vendorsRecord(
    breakdowns.map((item) => ({
      name: item.subcategory,
      vendors: item.merchants,
    })),
  );

  if (data.subcategories.length === 0) {
    return (
      <EmptyPrompt
        title="No subcategories in this range"
        description="Create subcategories, then assign them on transactions."
        href="/classifications?tab=subcategories&create=1"
        actionLabel="Create subcategory"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Subcategory breakdown"
            info="Every subcategory with spend, sliced by Merchant clean. The last 15% inside each row rolls into Other. Click a bar to open its merchant detail."
            rows={stacked.rows}
            series={stacked.series}
            currency={data.currency}
            labelWidth={180}
            onSelect={(name) => {
              if (breakdowns.some((item) => item.subcategory === name)) {
                onSelectSubcategory(name);
              }
            }}
            otherByRow={stacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Subcategory mix over time"
            info={`${ANALYSIS_PERIOD_META[period].label} spend by subcategory. Named bands are the first 85%. The last 15% is Other.`}
            series={data.subcategorySeries}
            monthly={data.subcategoryMonthly}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.subcategoryOther}
            otherByPeriod={data.subcategoryOtherByPeriod}
          />
          <SubcategoryDrilldown
            data={data}
            selected={subcategory}
            onSelect={onSelectSubcategory}
            period={period}
            onPeriodChange={onPeriodChange}
          />
          <TaxonomyBreakdownTable
            title="All subcategories"
            info="Every subcategory label in this range with spend, share of lifestyle outflow, and top Merchant clean names inside each subcategory."
            nameLabel="Subcategory"
            rows={data.subcategories}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top merchants"
            stacked={stacked}
          />
        </div>
      }
      summary={
        <div className="grid gap-6 lg:grid-cols-2">
          <LeaderboardTable
            title="Top subcategories"
            info="Biggest subcategories by lifestyle spend. Click a row to see the vendors inside."
            nameLabel="Subcategory"
            rows={data.subcategories}
            currency={data.currency}
            totalSpend={total}
            vendorsByRow={merchantsBySubcategory}
            transactionsForRow={(name) => peeksFor(data, "subcategory", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "subcategory-merchant", row, vendor)
            }
          />
          {data.subcategories.map((item) => {
            const rows =
              breakdowns.find((entry) => entry.subcategory === item.name)
                ?.merchants ?? categoriesForSection(stacked, item.name);
            if (rows.length === 0) return null;
            return (
              <LeaderboardTable
                key={item.name}
                title={`Top ${item.name} merchants`}
                info={`Biggest Merchant clean names inside ${item.name}. Share is of that subcategory.`}
                nameLabel="Merchant"
                rows={rows}
                currency={data.currency}
                totalSpend={item.spend}
                transactionsForRow={(name) =>
                  peeksFor(data, "subcategory-merchant", item.name, name)
                }
              />
            );
          })}
        </div>
      }
      average={
        <div className="grid gap-6 lg:grid-cols-2">
          <AverageLeaderboardTable
            title="Average by subcategory"
            info={`Total spend and transaction count for each subcategory, divided by ${periodCount} ${periodMeta.nounPlural} in this range.`}
            nameLabel="Subcategory"
            rows={data.subcategories}
            currency={data.currency}
            period={period}
            periodCount={periodCount}
            vendorsByRow={merchantsBySubcategory}
            transactionsForRow={(name) => peeksFor(data, "subcategory", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "subcategory-merchant", row, vendor)
            }
          />
          {data.subcategories.map((item) => {
            const rows =
              breakdowns.find((entry) => entry.subcategory === item.name)
                ?.merchants ?? categoriesForSection(stacked, item.name);
            if (rows.length === 0) return null;
            return (
              <AverageLeaderboardTable
                key={item.name}
                title={`Average ${item.name} merchants`}
                info={`Merchant averages inside ${item.name}, per ${periodMeta.noun}.`}
                nameLabel="Merchant"
                rows={rows}
                currency={data.currency}
                period={period}
                periodCount={periodCount}
                transactionsForRow={(name) =>
                  peeksFor(data, "subcategory-merchant", item.name, name)
                }
              />
            );
          })}
        </div>
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by subcategory"
          info={`Highest, median, and lowest ${periodMeta.label.toLowerCase()} spend for each subcategory inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Subcategory"
          rows={data.subcategories}
          series={data.subcategorySeries}
          monthly={data.subcategoryMonthly}
          currency={data.currency}
          otherByPeriod={data.subcategoryOtherByPeriod}
          transactionsForRow={(name) => peeksFor(data, "subcategory", name)}
        />
      }
    />
  );
}

function TagDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (tag: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisTagBreakdown | undefined =
    data.tagBreakdowns.find((item) => item.tag === selected) ??
    data.tagBreakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Tag detail"
        info="Pick a tag. Merchants come from Merchant clean on each tagged transaction."
      />
      <div className="flex flex-wrap gap-1">
        {data.tagBreakdowns.map((item) => (
          <Button
            key={item.tag}
            type="button"
            size="sm"
            variant={item.tag === breakdown.tag ? "default" : "outline"}
            onClick={() => onSelect(item.tag)}
          >
            {item.tag}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.tag} merchant mix`}
        info={`How ${breakdown.tag} splits by Merchant clean over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.merchantSeries}
        monthly={breakdown.merchantMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.tag} merchants`}
        info="Merchant clean names inside this tag."
        rows={breakdown.merchants}
        currency={data.currency}
        color="oklch(0.55 0.12 35)"
        labelWidth={160}
      />
    </section>
  );
}

function TagsTab({
  data,
  tag,
  onSelectTag,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  tag: string;
  onSelectTag: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const stacked = data.tagStacked ?? { rows: [], series: [] };
  const breakdowns = data.tagBreakdowns ?? [];
  const tags = data.tags ?? [];
  const total = data.summary.totalSpend;
  const merchantsByTag = vendorsRecord(
    breakdowns.map((item) => ({
      name: item.tag,
      vendors: item.merchants,
    })),
  );

  if (tags.length === 0) {
    return (
      <EmptyPrompt
        title="No tags in this range"
        description="Create tags, then stick them on transactions. They chart here the same way subcategories do."
        href="/classifications?tab=tags&create=1"
        actionLabel="Create tag"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Tag breakdown"
            info="Every tag with spend, sliced by category. The last 15% inside each row rolls into Other. A transaction can carry more than one tag, so rows can overlap. Click a bar to open its merchant detail."
            rows={stacked.rows}
            series={stacked.series}
            currency={data.currency}
            labelWidth={160}
            onSelect={(name) => {
              if (breakdowns.some((item) => item.tag === name)) {
                onSelectTag(name);
              }
            }}
            otherByRow={stacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Tag mix over time"
            info={`${ANALYSIS_PERIOD_META[period].label} spend by tag. Standard draws each tag from zero so shared tags are not stacked twice. Relative is share of the tag-sum (can exceed unique spend). Named bands are the first 85%. The last 15% is Other.`}
            series={data.tagSeries}
            monthly={data.tagMonthly}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            overlapping
            other={data.tagOther}
            otherByPeriod={data.tagOtherByPeriod}
            nestedByPeriod={data.tagCategoryByPeriod}
          />
          <TagDrilldown
            data={data}
            selected={tag}
            onSelect={onSelectTag}
            period={period}
            onPeriodChange={onPeriodChange}
          />
          <TaxonomyBreakdownTable
            title="All tags"
            info="Every tag in this range with spend, share of lifestyle outflow, and top categories. Shares can add up past 100% because one row can have several tags."
            nameLabel="Tag"
            rows={tags}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top categories"
            stacked={stacked}
          />
        </div>
      }
      summary={
        <LeaderboardTable
          title="Top tags"
          info="Biggest tags by lifestyle spend. A transaction can carry more than one tag. Click a row to see the vendors inside."
          nameLabel="Tag"
          rows={tags}
          currency={data.currency}
          totalSpend={total}
          vendorsByRow={merchantsByTag}
          transactionsForRow={(name) => peeksFor(data, "tag", name)}
          transactionsForVendor={(row, vendor) =>
            peeksFor(data, "tag-merchant", row, vendor)
          }
        />
      }
      average={
        <AverageLeaderboardTable
          title="Average by tag"
          info={`Total spend and transaction count for each tag, divided by ${Math.max(data.monthly.length, 1)} ${ANALYSIS_PERIOD_META[period].nounPlural} in this range. One row can carry several tags.`}
          nameLabel="Tag"
          rows={tags}
          currency={data.currency}
          period={period}
          periodCount={Math.max(data.monthly.length, 1)}
          vendorsByRow={merchantsByTag}
          transactionsForRow={(name) => peeksFor(data, "tag", name)}
          transactionsForVendor={(row, vendor) =>
            peeksFor(data, "tag-merchant", row, vendor)
          }
        />
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by tag"
          info={`Highest, median, and lowest ${ANALYSIS_PERIOD_META[period].label.toLowerCase()} spend for each tag inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Tag"
          rows={tags}
          series={data.tagSeries}
          monthly={data.tagMonthly}
          currency={data.currency}
          otherByPeriod={data.tagOtherByPeriod}
          transactionsForRow={(name) => peeksFor(data, "tag", name)}
        />
      }
    />
  );
}

function TypeDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (type: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdown: AnalysisTypeBreakdown | undefined =
    data.typeBreakdowns.find((item) => item.type === selected) ??
    data.typeBreakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Code detail"
        info="Pick a code (purchase, subscription, fee, …). Merchants come from Merchant clean on each matching line."
      />
      <div className="flex flex-wrap gap-1">
        {data.typeBreakdowns.map((item) => (
          <Button
            key={item.type}
            type="button"
            size="sm"
            variant={item.type === breakdown.type ? "default" : "outline"}
            onClick={() => onSelect(item.type)}
          >
            {item.type}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.type} merchant mix`}
        info={`How ${breakdown.type} splits by Merchant clean over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.merchantSeries}
        monthly={breakdown.merchantMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.type} merchants`}
        info="Merchant clean names inside this type."
        rows={breakdown.merchants}
        currency={data.currency}
        color="oklch(0.55 0.12 35)"
        labelWidth={160}
      />
    </section>
  );
}

function TypesTab({
  data,
  type,
  onSelectType,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  type: string;
  onSelectType: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const stacked = data.typeStacked ?? { rows: [], series: [] };
  const breakdowns = data.typeBreakdowns ?? [];
  const types = data.types ?? [];
  const total = data.summary.totalSpend;
  const merchantsByType = vendorsRecord(
    breakdowns.map((item) => ({
      name: item.type,
      vendors: item.merchants,
    })),
  );

  if (types.length === 0) {
    return (
      <EmptyPrompt
        title="No codes in this range"
        description="Import a statement so lines get a code (purchase, payment, fee, subscription)."
        href="/statements"
        actionLabel="Upload statement"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Code breakdown"
            info="Spend by code, sliced by category. The last 15% inside each row rolls into Other. Click a bar to open its merchant detail."
            rows={stacked.rows}
            series={stacked.series}
            currency={data.currency}
            labelWidth={160}
            onSelect={(name) => {
              if (breakdowns.some((item) => item.type === name)) {
                onSelectType(name);
              }
            }}
            otherByRow={stacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Code mix over time"
            info={`${ANALYSIS_PERIOD_META[period].label} spend by type. Standard draws each type from zero so shared types are not stacked twice. Relative is share of the type-sum (can exceed unique spend). Named bands are the first 85%. The last 15% is Other.`}
            series={data.typeSeries}
            monthly={data.typeMonthly}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            overlapping
            other={data.typeOther}
            otherByPeriod={data.typeOtherByPeriod}
            nestedByPeriod={data.typeCategoryByPeriod}
          />
          <TypeDrilldown
            data={data}
            selected={type}
            onSelect={onSelectType}
            period={period}
            onPeriodChange={onPeriodChange}
          />
          <TaxonomyBreakdownTable
            title="All codes"
            info="Every type in this range with spend, share of lifestyle outflow, and top categories. Shares can add up past 100% because one row can have several types."
            nameLabel="Type"
            rows={types}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top categories"
            stacked={stacked}
          />
        </div>
      }
      summary={
        <LeaderboardTable
          title="Top types"
          info="Biggest types by lifestyle spend. A transaction can carry more than one type. Click a row to see the vendors inside."
          nameLabel="Type"
          rows={types}
          currency={data.currency}
          totalSpend={total}
          vendorsByRow={merchantsByType}
          transactionsForRow={(name) => peeksFor(data, "type", name)}
          transactionsForVendor={(row, vendor) =>
            peeksFor(data, "type-merchant", row, vendor)
          }
        />
      }
      average={
        <AverageLeaderboardTable
          title="Average by type"
          info={`Total spend and transaction count for each type, divided by ${Math.max(data.monthly.length, 1)} ${ANALYSIS_PERIOD_META[period].nounPlural} in this range. One row can carry several types.`}
          nameLabel="Type"
          rows={types}
          currency={data.currency}
          period={period}
          periodCount={Math.max(data.monthly.length, 1)}
          vendorsByRow={merchantsByType}
          transactionsForRow={(name) => peeksFor(data, "type", name)}
          transactionsForVendor={(row, vendor) =>
            peeksFor(data, "type-merchant", row, vendor)
          }
        />
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by type"
          info={`Highest, median, and lowest ${ANALYSIS_PERIOD_META[period].label.toLowerCase()} spend for each type inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Type"
          rows={types}
          series={data.typeSeries}
          monthly={data.typeMonthly}
          currency={data.currency}
          otherByPeriod={data.typeOtherByPeriod}
          transactionsForRow={(name) => peeksFor(data, "type", name)}
        />
      }
    />
  );
}

function merchantPrimaryCategory(item: AnalysisMerchantBreakdown) {
  return item.categories?.[0]?.name?.trim() || "Uncategorized";
}

function merchantMatchesCategory(
  item: AnalysisMerchantBreakdown,
  category: string,
) {
  if (category === "all") return true;
  const names = (item.categories ?? [])
    .map((entry) => entry.name.trim())
    .filter(Boolean);
  if (names.length === 0) return category === "Uncategorized";
  return names.includes(category);
}

function MerchantDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (merchant: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const breakdowns = data.merchantBreakdowns;

  const categoryFilters = useMemo(() => {
    const spendByCategory = new Map<string, number>();
    for (const cat of data.categories) {
      spendByCategory.set(cat.name, cat.spend);
    }
    const present = new Set<string>();
    for (const item of breakdowns) {
      const cats = (item.categories ?? [])
        .map((entry) => entry.name.trim())
        .filter(Boolean);
      if (cats.length === 0) {
        present.add("Uncategorized");
        continue;
      }
      for (const name of cats) {
        present.add(name);
        if (!spendByCategory.has(name)) {
          const hit = item.categories?.find((entry) => entry.name === name);
          spendByCategory.set(name, hit?.spend ?? 0);
        }
      }
    }
    const ranked = data.categories
      .map((item) => item.name)
      .filter((name) => present.has(name));
    const extras = [...present]
      .filter((name) => !ranked.includes(name) && name !== "Uncategorized")
      .sort((a, b) => a.localeCompare(b));
    const ordered = [
      ...ranked,
      ...extras,
      ...(present.has("Uncategorized") ? ["Uncategorized"] : []),
    ];
    return ordered.map((name) => ({
      name,
      count: breakdowns.filter((item) => merchantMatchesCategory(item, name))
        .length,
    }));
  }, [breakdowns, data.categories]);

  const visibleBreakdowns = useMemo(
    () =>
      breakdowns.filter((item) =>
        merchantMatchesCategory(item, categoryFilter),
      ),
    [breakdowns, categoryFilter],
  );

  const merchantGroups = useMemo(() => {
    if (categoryFilter !== "all") {
      return [{ name: categoryFilter, items: visibleBreakdowns }];
    }
    const byCategory = new Map<string, AnalysisMerchantBreakdown[]>();
    for (const item of breakdowns) {
      const key = merchantPrimaryCategory(item);
      const list = byCategory.get(key) ?? [];
      list.push(item);
      byCategory.set(key, list);
    }
    const order = categoryFilters.map((item) => item.name);
    return order
      .filter((name) => (byCategory.get(name)?.length ?? 0) > 0)
      .map((name) => ({
        name,
        items: byCategory.get(name) ?? [],
      }));
  }, [breakdowns, categoryFilter, categoryFilters, visibleBreakdowns]);

  const breakdown: AnalysisMerchantBreakdown | undefined =
    breakdowns.find((item) => item.merchant === selected) ?? breakdowns[0];

  if (!breakdown) return null;

  const selectCategory = (next: string) => {
    setCategoryFilter(next);
    const nextVisible = breakdowns.filter((item) =>
      merchantMatchesCategory(item, next),
    );
    if (
      nextVisible.length > 0 &&
      !nextVisible.some((item) => item.merchant === breakdown.merchant)
    ) {
      onSelect(nextVisible[0].merchant);
    }
  };

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Merchant detail"
        info="Filter by category, then pick a Merchant clean name. Subcategories come from transaction labels."
      />
      <div className="space-y-4">
        <div
          role="group"
          aria-label="Filter merchants by category"
          className="flex flex-wrap items-center gap-1.5"
        >
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "all" ? "default" : "outline"}
            onClick={() => selectCategory("all")}
          >
            All
            <span className="ml-1 tabular-nums opacity-70">
              {breakdowns.length}
            </span>
          </Button>
          {categoryFilters.length > 0 ? (
            <span
              aria-hidden
              className="mx-0.5 hidden h-4 w-px shrink-0 bg-[var(--border)] sm:inline-block"
            />
          ) : null}
          {categoryFilters.map((item) => (
            <Button
              key={item.name}
              type="button"
              size="sm"
              variant={categoryFilter === item.name ? "default" : "outline"}
              onClick={() => selectCategory(item.name)}
            >
              {item.name}
              <span className="ml-1 tabular-nums opacity-70">{item.count}</span>
            </Button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-4 md:items-start">
          <aside className="min-w-0 md:col-span-1 md:sticky md:top-4 md:max-h-[min(70vh,42rem)] md:overflow-y-auto md:pr-1">
            <div className="max-h-[22rem] space-y-4 overflow-y-auto pr-1 md:max-h-none md:overflow-visible md:pr-0">
              {merchantGroups.map((group) => (
                <div key={group.name} className="space-y-2">
                  {categoryFilter === "all" ? (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium tracking-wide text-[var(--muted-foreground)]">
                        {group.name}
                      </span>
                      <div className="h-px min-w-8 flex-1 bg-[var(--border)]" />
                      <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                        {group.items.length}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
                    {group.items.map((item) => (
                      <Button
                        key={item.merchant}
                        type="button"
                        size="sm"
                        variant={
                          item.merchant === breakdown.merchant
                            ? "default"
                            : "outline"
                        }
                        className="max-w-full md:w-full md:justify-start"
                        onClick={() => onSelect(item.merchant)}
                      >
                        <MerchantLabel name={item.merchant} />
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {visibleBreakdowns.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No merchants in this category.
                </p>
              ) : null}
            </div>
          </aside>

          <div className="min-w-0 space-y-4 md:col-span-3">
            <StackedMixChart
              title={`${breakdown.merchant} subcategory mix`}
              info={`How ${breakdown.merchant} splits by subcategory over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
              series={breakdown.typeSeries}
              monthly={breakdown.typeMonthly}
              currency={data.currency}
              period={period}
              onPeriodChange={onPeriodChange}
              other={breakdown.other}
              otherByPeriod={breakdown.otherByPeriod}
            />
            <RankedBarChart
              title={`${breakdown.merchant} subcategories`}
              info="Subcategory labels inside this Merchant clean name."
              rows={breakdown.types}
              currency={data.currency}
              color="oklch(0.52 0.1 155)"
              labelWidth={160}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function MerchantsTab({
  data,
  merchant,
  onSelectMerchant,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  merchant: string;
  onSelectMerchant: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const stacked = data.merchantStacked ?? { rows: [], series: [] };
  const breakdowns = data.merchantBreakdowns ?? [];
  const merchants = data.merchants ?? [];
  const total = data.summary.totalSpend;
  const splitsByMerchant = vendorsRecord(
    breakdowns.map((item) => ({
      name: item.merchant,
      vendors: item.types,
    })),
  );

  if (merchants.length === 0) {
    return (
      <EmptyPrompt
        title="No merchants in this range"
        description="Import statements so payee names land here the same way subcategories do."
        href="/statements"
        actionLabel="Upload statement"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <StackedRankedBarChart
            title="Merchant breakdown"
            info="Every Merchant clean name with spend, sliced by subcategory. The last 15% inside each row rolls into Other. Click a bar to open its subcategory detail."
            rows={stacked.rows}
            series={stacked.series}
            currency={data.currency}
            labelWidth={180}
            onSelect={(name) => {
              if (breakdowns.some((item) => item.merchant === name)) {
                onSelectMerchant(name);
              }
            }}
            otherByRow={stacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Merchant mix over time"
            info={`${ANALYSIS_PERIOD_META[period].label} spend by Merchant clean. Named bands are the first 85%. The last 15% is Other.`}
            series={data.merchantSeries ?? []}
            monthly={data.merchantMonthly ?? []}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.merchantOther}
            otherByPeriod={data.merchantOtherByPeriod}
          />
          <MerchantDrilldown
            data={data}
            selected={merchant}
            onSelect={onSelectMerchant}
            period={period}
            onPeriodChange={onPeriodChange}
          />
          <TaxonomyBreakdownTable
            title="All merchants"
            info="Every Merchant clean name in this range with spend, share of lifestyle outflow, and top subcategories inside each merchant."
            nameLabel="Merchant clean"
            rows={merchants}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top subcategories"
            stacked={stacked}
          />
          <RankedBarChart
            title="Places"
            info="From Transaction Locations. City when present, else region. Online-only rows with no city are skipped."
            rows={data.places}
            currency={data.currency}
            color="oklch(0.48 0.09 300)"
          />
        </div>
      }
      summary={
        <LeaderboardTable
          title="Top merchants"
          info="Biggest Merchant clean names by lifestyle spend. Click a row to see the subcategories inside."
          nameLabel="Merchant"
          rows={merchants}
          currency={data.currency}
          totalSpend={total}
          vendorsByRow={splitsByMerchant}
          transactionsForRow={(name) => peeksFor(data, "merchant", name)}
          transactionsForVendor={(row, vendor) =>
            peeksFor(data, "subcategory-merchant", vendor, row)
          }
        />
      }
      average={
        <AverageLeaderboardTable
          title="Average by merchant"
          info={`Total spend and transaction count for each Merchant clean name, divided by ${Math.max(data.monthly.length, 1)} ${ANALYSIS_PERIOD_META[period].nounPlural} in this range.`}
          nameLabel="Merchant"
          rows={merchants}
          currency={data.currency}
          period={period}
          periodCount={Math.max(data.monthly.length, 1)}
          vendorsByRow={splitsByMerchant}
          transactionsForRow={(name) => peeksFor(data, "merchant", name)}
          transactionsForVendor={(row, vendor) =>
            peeksFor(data, "subcategory-merchant", vendor, row)
          }
        />
      }
      range={
        <RangeLeaderboardTable
          title="High Mid Low by merchant"
          info={`Highest, median, and lowest ${ANALYSIS_PERIOD_META[period].label.toLowerCase()} spend for each Merchant clean name inside the selected header range. Zero buckets are skipped.`}
          nameLabel="Merchant"
          rows={merchants}
          series={data.merchantSeries}
          monthly={data.merchantMonthly}
          currency={data.currency}
          otherByPeriod={data.merchantOtherByPeriod}
          transactionsForRow={(name) => peeksFor(data, "merchant", name)}
        />
      }
    />
  );
}

function IncomeSourceDrilldown({
  data,
  selected,
  onSelect,
  period,
  onPeriodChange,
}: {
  data: AnalysisData;
  selected: string;
  onSelect: (source: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
}) {
  const breakdowns = data.incomeSourceBreakdowns ?? [];
  const breakdown: AnalysisIncomeSourceBreakdown | undefined =
    breakdowns.find((item) => item.source === selected) ?? breakdowns[0];

  if (!breakdown) return null;

  return (
    <section className="space-y-4">
      <ChartTitle
        title="Income source detail"
        info="Pick a payor. Categories come from the labels on those inflow rows."
      />
      <div className="flex flex-wrap gap-1">
        {breakdowns.map((item) => (
          <Button
            key={item.source}
            type="button"
            size="sm"
            variant={item.source === breakdown.source ? "default" : "outline"}
            onClick={() => onSelect(item.source)}
          >
            {item.source}
          </Button>
        ))}
      </div>
      <StackedMixChart
        title={`${breakdown.source} category mix`}
        info={`How ${breakdown.source} splits by category over ${ANALYSIS_PERIOD_META[period].nounPlural}. ${formatMoney(breakdown.spend, data.currency)} in this range.`}
        series={breakdown.categorySeries}
        monthly={breakdown.categoryMonthly}
        currency={data.currency}
        period={period}
        onPeriodChange={onPeriodChange}
        other={breakdown.other}
        otherByPeriod={breakdown.otherByPeriod}
      />
      <RankedBarChart
        title={`${breakdown.source} categories`}
        info="Category labels inside this income source."
        rows={breakdown.categories}
        currency={data.currency}
        color="oklch(0.52 0.1 155)"
        labelWidth={160}
      />
    </section>
  );
}

function IncomeTab({
  data,
  source,
  onSelectSource,
  period,
  onPeriodChange,
  pane,
  onPaneChange,
}: {
  data: AnalysisData;
  source: string;
  onSelectSource: (name: string) => void;
  period: AnalysisPeriod;
  onPeriodChange: (value: AnalysisPeriod) => void;
  pane: FacetPane;
  onPaneChange: (value: FacetPane) => void;
}) {
  const stacked = data.incomeSourceStacked ?? { rows: [], series: [] };
  const categoryStacked = data.incomeCategoryStacked ?? {
    rows: [],
    series: [],
  };
  const breakdowns = data.incomeSourceBreakdowns ?? [];
  const sources = data.incomeSources ?? [];
  const incomeCategories = data.incomeCategories ?? [];
  const accounts = data.incomeAccounts ?? [];
  const total = data.summary.totalIncome;
  const periodMeta = ANALYSIS_PERIOD_META[period];
  const periodCount = Math.max(data.monthly.length, 1);
  const splitsBySource = vendorsRecord(
    breakdowns.map((item) => ({
      name: item.source,
      vendors: item.categories,
    })),
  );
  let peakIncomePeriod: string | null = null;
  let peakIncomeAmount = 0;
  for (const point of data.monthly) {
    if (point.income > peakIncomeAmount) {
      peakIncomeAmount = point.income;
      peakIncomePeriod = point.label;
    }
  }
  const incomeCount = sources.reduce((sum, row) => sum + (row.count ?? 0), 0);

  if (sources.length === 0) {
    return (
      <EmptyPrompt
        title="No income in this range"
        description="Upload a statement with payroll, cashback, or e-transfers in. Card payment credits stay out."
        href="/statements"
        actionLabel="Upload statement"
      />
    );
  }

  return (
    <FacetPaneShell
      pane={pane}
      onPaneChange={onPaneChange}
      visualizations={
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            <Stat
              label="Income"
              value={formatMoney(total, data.currency)}
              info={`${incomeCount} inflow rows. Payroll, cashback, and e-transfers in. Card payment credits on the visa are not income.`}
            />
            <Stat
              label={periodMeta.incomeRateLabel}
              value={formatMoney(
                data.summary.incomePerPeriod ?? 0,
                data.currency,
              )}
              info={`Income divided by ${periodMeta.nounPlural} in this range (same buckets as the ${periodMeta.label.toLowerCase()} charts).`}
            />
            <Stat
              label={`Peak ${periodMeta.noun}`}
              value={
                peakIncomePeriod
                  ? formatMoney(peakIncomeAmount, data.currency)
                  : "-"
              }
              info={
                peakIncomePeriod
                  ? `Highest income: ${peakIncomePeriod}.`
                  : "No income in this range."
              }
            />
            <Stat
              label="Sources"
              value={String(sources.length)}
              info="Distinct payor names (Merchant clean, falling back to the statement line)."
            />
          </section>
          <StackedRankedBarChart
            title="Income by source"
            info="Every payor with real income, sliced by category. The last 15% inside each row rolls into Other. Click a bar to open its category detail."
            rows={stacked.rows}
            series={stacked.series}
            currency={data.currency}
            labelWidth={180}
            onSelect={(name) => {
              if (breakdowns.some((item) => item.source === name)) {
                onSelectSource(name);
              }
            }}
            otherByRow={stacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Income mix over time"
            info={`${periodMeta.label} income by payor. Named bands are the first 85%. The last 15% is Other.`}
            series={data.incomeSourceSeries ?? []}
            monthly={data.incomeSourceMonthly ?? []}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.incomeSourceOther}
            otherByPeriod={data.incomeSourceOtherByPeriod}
          />
          <StackedRankedBarChart
            title="Income by category"
            info="Income categories, sliced by payor. The last 15% inside each row rolls into Other."
            rows={categoryStacked.rows}
            series={categoryStacked.series}
            currency={data.currency}
            labelWidth={180}
            otherByRow={categoryStacked.otherByRow}
            showViewToggle
          />
          <StackedMixChart
            title="Category mix over time"
            info={`${periodMeta.label} income by category. Named bands are the first 85%. The last 15% is Other.`}
            series={data.incomeCategorySeries ?? []}
            monthly={data.incomeCategoryMonthly ?? []}
            currency={data.currency}
            period={period}
            onPeriodChange={onPeriodChange}
            variant="area"
            other={data.incomeCategoryOther}
            otherByPeriod={data.incomeCategoryOtherByPeriod}
          />
          <IncomeSourceDrilldown
            data={data}
            selected={source}
            onSelect={onSelectSource}
            period={period}
            onPeriodChange={onPeriodChange}
          />
          <TaxonomyBreakdownTable
            title="All income sources"
            info="Every payor in this range with amount, share of total income, and top categories inside each source."
            nameLabel="Source"
            rows={sources}
            currency={data.currency}
            totalSpend={total}
            nestedLabel="Top categories"
            stacked={stacked}
          />
          <RankedBarChart
            title="Income by account"
            info="Which account received the inflow."
            rows={accounts}
            currency={data.currency}
            color="oklch(0.52 0.1 155)"
            labelWidth={150}
          />
        </div>
      }
      summary={
        <div className="space-y-6">
          <LeaderboardTable
            title="Top income sources"
            info="Biggest payors by real income. Click a row to see the categories inside."
            nameLabel="Source"
            rows={sources}
            currency={data.currency}
            totalSpend={total}
            vendorsByRow={splitsBySource}
            transactionsForRow={(name) => peeksFor(data, "income-source", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "income-source-category", row, vendor)
            }
          />
          <LeaderboardTable
            title="Top income categories"
            info="Biggest income categories in this range."
            nameLabel="Category"
            rows={incomeCategories}
            currency={data.currency}
            totalSpend={total}
            transactionsForRow={(name) =>
              peeksFor(data, "income-category", name)
            }
          />
        </div>
      }
      average={
        <div className="space-y-6">
          <AverageLeaderboardTable
            title="Average by source"
            info={`Total income and inflow count for each payor, divided by ${periodCount} ${periodMeta.nounPlural} in this range.`}
            nameLabel="Source"
            rows={sources}
            currency={data.currency}
            period={period}
            periodCount={periodCount}
            vendorsByRow={splitsBySource}
            transactionsForRow={(name) => peeksFor(data, "income-source", name)}
            transactionsForVendor={(row, vendor) =>
              peeksFor(data, "income-source-category", row, vendor)
            }
          />
          <AverageLeaderboardTable
            title="Average by category"
            info={`Total income and inflow count for each category, divided by ${periodCount} ${periodMeta.nounPlural} in this range.`}
            nameLabel="Category"
            rows={incomeCategories}
            currency={data.currency}
            period={period}
            periodCount={periodCount}
            transactionsForRow={(name) =>
              peeksFor(data, "income-category", name)
            }
          />
        </div>
      }
      range={
        <div className="space-y-6">
          <RangeLeaderboardTable
            title="High Mid Low by source"
            info={`Highest, median, and lowest ${periodMeta.label.toLowerCase()} income for each payor inside the selected header range. Zero buckets are skipped.`}
            nameLabel="Source"
            rows={sources}
            series={data.incomeSourceSeries ?? []}
            monthly={data.incomeSourceMonthly ?? []}
            currency={data.currency}
            otherByPeriod={data.incomeSourceOtherByPeriod}
            transactionsForRow={(name) => peeksFor(data, "income-source", name)}
          />
          <RangeLeaderboardTable
            title="High Mid Low by category"
            info={`Highest, median, and lowest ${periodMeta.label.toLowerCase()} income for each category inside the selected header range. Zero buckets are skipped.`}
            nameLabel="Category"
            rows={incomeCategories}
            series={data.incomeCategorySeries ?? []}
            monthly={data.incomeCategoryMonthly ?? []}
            currency={data.currency}
            otherByPeriod={data.incomeCategoryOtherByPeriod}
            transactionsForRow={(name) =>
              peeksFor(data, "income-category", name)
            }
          />
        </div>
      }
    />
  );
}

function PatternsTab({ data }: { data: AnalysisData }) {
  const weekend = data.weekendSplit ?? [];
  const weekdaySpend =
    weekend.find((row) => row.name === "Weekday")?.spend ?? 0;
  const weekendSpend =
    weekend.find((row) => row.name === "Weekend")?.spend ?? 0;
  const weekendShare =
    weekdaySpend + weekendSpend > 0
      ? Math.round((weekendSpend / (weekdaySpend + weekendSpend)) * 100)
      : 0;
  const ticketSizes = data.ticketSizes ?? [];
  const smallTicket = ticketSizes.find((row) => row.name === "Under $15");
  const habitMerchants = data.habitMerchants ?? [];
  const countries = data.countries ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Weekend share"
          value={`${weekendShare}%`}
          info={`${formatMoney(weekendSpend, data.currency)} on Sat-Sun vs ${formatMoney(weekdaySpend, data.currency)} on weekdays.`}
        />
        <Stat
          label="Small swipes"
          value={(smallTicket?.count ?? 0).toLocaleString("en-US")}
          info={`Under $15 purchases totaling ${formatMoney(smallTicket?.spend ?? 0, data.currency)}.`}
        />
        <Stat
          label="Habit merchants"
          value={habitMerchants.length.toLocaleString("en-US")}
          info="Vendors with 6+ lifestyle purchases in this range."
        />
        <Stat
          label="Countries"
          value={(countries.length || 0).toLocaleString("en-US")}
          info="Distinct countries on location-tagged spend rows."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title="How you pay"
          info="From Transaction Payment Refs channel, falling back to enrichment channel."
          rows={data.channels}
          currency={data.currency}
          color="oklch(0.45 0.08 20)"
        />
        <RankedBarChart
          title="Weekday vs weekend"
          info="Lifestyle spend split into Mon-Fri and Sat-Sun using the authorized date when present."
          rows={weekend}
          currency={data.currency}
          color="oklch(0.52 0.1 155)"
          labelWidth={100}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeekdayChart data={data} />
        <DayOfMonthChart data={data} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title="Purchase size"
          info="How much each lifestyle swipe cost. Lots of small trips can still be cheap; a few large tickets usually dominate dollars."
          rows={ticketSizes}
          currency={data.currency}
          color="oklch(0.55 0.12 35)"
          labelWidth={110}
        />
        <FrequencyBarChart
          title="Habit merchants"
          info="Merchants you hit 6+ times in this range, ranked by trip count. Spend shows in the tooltip."
          rows={habitMerchants}
          currency={data.currency}
          color="oklch(0.5 0.1 220)"
          labelWidth={150}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBarChart
          title="Places"
          info="From Transaction Locations. City when present, else region. Online-only rows with no city are skipped."
          rows={data.places}
          currency={data.currency}
          color="oklch(0.48 0.09 300)"
        />
        <RankedBarChart
          title="Countries"
          info="Normalized country on location-tagged spend (Canada / United States / Philippines, …)."
          rows={countries}
          currency={data.currency}
          color="oklch(0.5 0.08 250)"
        />
      </div>

      <RankedBarChart
        title="By account"
        info="Lifestyle spend on each linked account. Card purchases sit on the card; chequing shows PAD, e-transfer, and cash."
        rows={data.accounts}
        currency={data.currency}
        color="oklch(0.5 0.1 220)"
        labelWidth={150}
      />
    </div>
  );
}

export function AnalysisDashboard() {
  const [prefs] = useState(readAnalysisUiPrefs);
  const [range, setRange] = useState<AnalysisRange>(prefs.range);
  const [period, setPeriod] = useState<AnalysisPeriod>(prefs.period);
  const [tab, setTab] = useState<AnalysisTab>(prefs.tab);
  const [pane, setPane] = useState<FacetPane>(prefs.pane);
  const [category, setCategory] = useState(prefs.category);
  const [subcategory, setSubcategory] = useState(prefs.subcategory);
  const [tag, setTag] = useState(prefs.tag);
  const [type, setType] = useState(prefs.type);
  const [merchant, setMerchant] = useState(prefs.merchant);
  const [incomeSource, setIncomeSource] = useState(prefs.incomeSource);
  const query = useAnalysis(range, period);
  const data = query.data;

  useEffect(() => {
    writeAnalysisUiPrefs({
      range,
      period,
      tab,
      pane,
      category,
      subcategory,
      tag,
      type,
      merchant,
      incomeSource,
    });
  }, [
    range,
    period,
    tab,
    pane,
    category,
    subcategory,
    tag,
    type,
    merchant,
    incomeSource,
  ]);

  useEffect(() => {
    const names = data?.breakdowns.map((item) => item.category) ?? [];
    if (names.length === 0) return;
    if (!names.includes(category)) setCategory(names[0] ?? "");
  }, [data, category]);

  useEffect(() => {
    const names =
      data?.subcategoryBreakdowns.map((item) => item.subcategory) ?? [];
    if (names.length === 0) return;
    if (!names.includes(subcategory)) setSubcategory(names[0] ?? "");
  }, [data, subcategory]);

  useEffect(() => {
    const names = data?.tagBreakdowns.map((item) => item.tag) ?? [];
    if (names.length === 0) return;
    if (!names.includes(tag)) setTag(names[0] ?? "");
  }, [data, tag]);

  useEffect(() => {
    const names = data?.typeBreakdowns.map((item) => item.type) ?? [];
    if (names.length === 0) return;
    if (!names.includes(type)) setType(names[0] ?? "");
  }, [data, type]);

  useEffect(() => {
    const names = data?.merchantBreakdowns.map((item) => item.merchant) ?? [];
    if (names.length === 0) return;
    if (!names.includes(merchant)) setMerchant(names[0] ?? "");
  }, [data, merchant]);

  useEffect(() => {
    const names =
      data?.incomeSourceBreakdowns?.map((item) => item.source) ?? [];
    if (names.length === 0) return;
    if (!names.includes(incomeSource)) setIncomeSource(names[0] ?? "");
  }, [data, incomeSource]);

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <header className="flex flex-col gap-2 border-b border-[var(--border)] pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <h1 className="type-kicker text-[20px]">Analysis</h1>
              <InfoTip label="Analysis info">
                {data
                  ? `Covers ${formatDisplayDate(data.earliestDate)} to ${formatDisplayDate(data.latestDate)}. Spend = purchases and money sent out, minus refunds. Moving money between your own accounts (like paying a card from chequing) is not counted as spend.`
                  : "See where money goes over time. Transfers between your own accounts are left out of spend."}
              </InfoTip>
            </div>
            <p className="type-lead sr-only sm:not-sr-only sm:max-w-xl">
              Charts and breakdowns of spending over time.
            </p>
          </div>
          <div className="flex w-full min-w-0 items-stretch justify-start gap-x-3 gap-y-2 sm:w-auto sm:flex-wrap sm:items-end sm:justify-end">
            <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1 sm:flex-none sm:items-center sm:gap-0.5">
              <span className="type-caption">Range</span>
              <SegmentedControl
                ariaLabel="Range"
                options={RANGE_OPTIONS}
                value={range}
                onChange={setRange}
              />
            </div>
            <div className="flex min-w-[8.25rem] flex-1 flex-col items-stretch gap-1 sm:min-w-0 sm:flex-none sm:items-center sm:gap-0.5">
              <label htmlFor="analysis-period" className="type-caption">
                Period
              </label>
              <NativeSelect
                id="analysis-period"
                size="sm"
                value={period}
                onChange={(event) =>
                  setPeriod(parseAnalysisPeriod(event.target.value))
                }
                className="h-full min-h-0 w-full flex-1 sm:h-auto sm:w-fit sm:flex-none [&_select]:h-full [&_select]:min-h-[calc(2.75rem+0.25rem+2px)] sm:[&_select]:h-6 sm:[&_select]:min-h-0 [&_select]:rounded-md [&_select]:py-0 [&_select]:pr-7 [&_select]:pl-2 [&_select]:text-base sm:[&_select]:text-xs [&_[data-slot=native-select-icon]]:right-2 [&_[data-slot=native-select-icon]]:size-3.5"
              >
                {ANALYSIS_PERIOD_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </header>

        <div className="space-y-2">
          <SegmentedControl
            ariaLabel="Analysis view"
            options={TAB_OPTIONS}
            value={tab}
            onChange={setTab}
          />

          {query.isError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              {query.error?.message ?? "Analysis failed"}
            </div>
          ) : null}

          {query.isPending && !data ? (
            query.encryptedLedger ? (
              <DecryptingPage />
            ) : (
              <PageSpinner />
            )
          ) : null}

          {data && data.transactionCount === 0 ? <EmptyState /> : null}

          {data && data.transactionCount > 0 ? (
            <>
              {tab === "main" ? (
                <MainTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                  onSelectCategory={(name) => {
                    if (
                      data.breakdowns.some((item) => item.category === name)
                    ) {
                      setCategory(name);
                      setTab("categories");
                    }
                  }}
                />
              ) : null}
              {tab === "sections" ? (
                <SectionsTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "spreads" ? (
                <SpreadsTab
                  data={data}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "categories" ? (
                <CategoriesTab
                  data={data}
                  category={category}
                  onSelectCategory={setCategory}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "subcategories" ? (
                <SubcategoriesTab
                  data={data}
                  subcategory={subcategory}
                  onSelectSubcategory={setSubcategory}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "tags" ? (
                <TagsTab
                  data={data}
                  tag={tag}
                  onSelectTag={setTag}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "types" ? (
                <TypesTab
                  data={data}
                  type={type}
                  onSelectType={setType}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "merchants" ? (
                <MerchantsTab
                  data={data}
                  merchant={merchant}
                  onSelectMerchant={setMerchant}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "income" ? (
                <IncomeTab
                  data={data}
                  source={incomeSource}
                  onSelectSource={setIncomeSource}
                  period={period}
                  onPeriodChange={setPeriod}
                  pane={pane}
                  onPaneChange={setPane}
                />
              ) : null}
              {tab === "patterns" ? <PatternsTab data={data} /> : null}
            </>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
