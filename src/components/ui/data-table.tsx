"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  dataTableFeatures,
  isDateWindowActive,
  type DataTableFeatures,
  type DateWindowFilter,
} from "@/components/ui/data-table-features";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { downloadCsv, toCsv } from "@/shared/lib/csv";
import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ListFilterIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";

type AutoWidthFormat = (value: unknown, row: unknown) => string;

type ColumnMeta = {
  width?: string;
  band?: "read" | "invent";
  label?: string;
  description?: string;
  nowrap?: boolean;
  /** Allow wrapping. Default is a single clipped line. */
  wrap?: boolean;
  /** Skip max-width so table-fixed leftover space can go to this column. */
  grow?: boolean;
  /**
   * Size the column to the longest formatted cell (plus header chrome).
   * `true` uses String(value). Pass a formatter for money / labels.
   */
  autoWidth?: boolean | AutoWidthFormat;
  /** Extra `ch` on the longest cell (clear button, padding). Default 1. */
  autoWidthPadCh?: number;
  autoWidthMinCh?: number;
  autoWidthMaxCh?: number;
};

type NestedColumnDef<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData
> & {
  columns?: NestedColumnDef<TData>[];
  accessorKey?: string;
  accessorFn?: (row: TData, index: number) => unknown;
  enableSorting?: boolean;
};

function autoWidthCellText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => autoWidthCellText(item)).join(", ");
  }
  return "";
}

function leafColumnDefs<TData extends RowData>(
  columns: NestedColumnDef<TData>[],
): NestedColumnDef<TData>[] {
  const leaves: NestedColumnDef<TData>[] = [];
  for (const column of columns) {
    if (column.columns?.length) {
      leaves.push(...leafColumnDefs(column.columns));
      continue;
    }
    leaves.push(column);
  }
  return leaves;
}

function columnDefId<TData extends RowData>(
  column: NestedColumnDef<TData>,
): string | undefined {
  if (column.id) return column.id;
  if (column.accessorKey != null) return String(column.accessorKey);
  return undefined;
}

function columnDefValue<TData extends RowData>(
  column: NestedColumnDef<TData>,
  row: TData,
  index: number,
): unknown {
  if (typeof column.accessorFn === "function") {
    return column.accessorFn(row, index);
  }
  const key = column.accessorKey ?? column.id;
  if (!key) return undefined;
  return (row as Record<string, unknown>)[key];
}

function computeAutoWidths<TData extends RowData>(
  columns: ColumnDef<DataTableFeatures, TData>[],
  data: TData[],
  filterColumnIds: Set<string>,
): Map<string, string> {
  const widths = new Map<string, string>();
  for (const column of leafColumnDefs(columns as NestedColumnDef<TData>[])) {
    const meta = column.meta as ColumnMeta | undefined;
    if (!meta?.autoWidth) continue;
    const columnId = columnDefId(column);
    if (!columnId) continue;

    const format: AutoWidthFormat =
      typeof meta.autoWidth === "function" ? meta.autoWidth : autoWidthCellText;
    const padCh = meta.autoWidthPadCh ?? 1;
    const minCh = meta.autoWidthMinCh ?? 8;
    const headerLabel =
      meta.label ??
      (typeof column.header === "string" ? column.header : columnId);
    const headerChromeCh = filterColumnIds.has(columnId)
      ? 6
      : column.enableSorting === false
        ? 0
        : 3;
    let maxCh = headerLabel.length + headerChromeCh;

    for (let index = 0; index < data.length; index += 1) {
      const row = data[index];
      if (row == null) continue;
      const text = format(columnDefValue(column, row, index), row);
      maxCh = Math.max(maxCh, text.length + padCh);
    }

    if (meta.autoWidthMaxCh != null) {
      maxCh = Math.min(maxCh, meta.autoWidthMaxCh);
    }
    widths.set(columnId, `${Math.max(maxCh, minCh)}ch`);
  }
  return widths;
}

function columnSizeStyle(meta: ColumnMeta | undefined) {
  const width = meta?.width;
  if (!width) return undefined;
  // Grow cols must not set `width` on cells. table-fixed treats that as a
  // specified column width and stretches actions with leftover space.
  if (meta?.grow) return { minWidth: width };
  return { width, minWidth: width, maxWidth: width };
}

function withAutoWidth(
  meta: ColumnMeta | undefined,
  columnId: string,
  autoWidths: Map<string, string>,
): ColumnMeta | undefined {
  const width = autoWidths.get(columnId);
  if (!width) return meta;
  return { ...meta, width };
}

function HeaderLabel({
  description,
  children,
}: {
  description?: string;
  children: ReactNode;
}) {
  if (!description) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-current/35">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-56 text-left">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

export type DataTableFilterOption = {
  label: string;
  value: string;
};

export type DataTableFilterConfig = {
  columnId: string;
  label: string;
  options: DataTableFilterOption[];
  allLabel?: string;
  /**
   * When set, option list only includes values present on rows that match
   * these parent column filters (e.g. Category thins when Section is set).
   */
  cascadeFrom?: string[];
};

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  enableGlobalFilter?: boolean;
  globalFilterFn?: "fuzzy" | "includesString";
  /** Column header filter menus (not toolbar dropdowns). */
  filters?: DataTableFilterConfig[];
  /**
   * When set, toolbar shows Month + date-range controls after Columns,
   * filtering this column via the `dateWindow` filterFn.
   */
  dateColumnId?: string;
  initialSorting?: SortingState;
  initialColumnVisibility?: ColumnVisibilityState;
  pageSize?: number;
  toolbar?: ReactNode;
  enableColumnToggle?: boolean;
  /** When set, toolbar shows Export CSV for filtered rows. */
  csvFilename?: string;
  /** Stretch the table to the card width instead of hugging column mins. */
  fillWidth?: boolean;
  /** When set, toolbar shows Refresh to reload table data. */
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  isLoading?: boolean;
}

function csvColumnLabel(column: {
  id: string;
  columnDef: {
    header?: unknown;
    meta?: unknown;
  };
}): string | null {
  const meta = column.columnDef.meta as { label?: string } | undefined;
  if (meta?.label) return meta.label;
  const header = column.columnDef.header;
  if (typeof header === "string" && header) return header;
  return null;
}

function menuColumnLabel(column: {
  id: string;
  columnDef: {
    header?: unknown;
    meta?: unknown;
  };
}): string {
  return csvColumnLabel(column) ?? column.id;
}

function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  if (!year || !month) return yyyyMm;
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatRangeLabel(from?: string, to?: string): string {
  if (from && to) {
    return from === to ? from : `${from} → ${to}`;
  }
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "Date range";
}

function readDateWindow(value: unknown): DateWindowFilter {
  if (!isDateWindowActive(value)) return {};
  const legacy = value as DateWindowFilter & { month?: string };
  const months = value.months ?? (legacy.month ? [legacy.month] : undefined);
  return {
    ...(months?.length ? { months } : {}),
    ...(value.from ? { from: value.from } : {}),
    ...(value.to ? { to: value.to } : {}),
  };
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Filter…",
  enableGlobalFilter = false,
  globalFilterFn = "fuzzy",
  filters = [],
  dateColumnId,
  initialSorting = [],
  initialColumnVisibility = {},
  pageSize = 10,
  toolbar,
  enableColumnToggle = false,
  csvFilename,
  fillWidth = true,
  onRefresh,
  isRefreshing = false,
  isLoading = false,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(initialColumnVisibility);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [legacyFilterValue, setLegacyFilterValue] = useState("");
  const isMobile = useIsMobile();

  const useGlobalSearch = enableGlobalFilter;
  const showSearch = enableGlobalFilter || Boolean(searchKey);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter: useGlobalSearch ? globalFilter : undefined,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    globalFilterFn: useGlobalSearch ? globalFilterFn : undefined,
    enableGlobalFilter: useGlobalSearch,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;

  const activeFilterCount = useMemo(() => {
    const searchActive = useGlobalSearch
      ? Boolean(globalFilter.trim())
      : Boolean(legacyFilterValue.trim());
    return (
      (searchActive ? 1 : 0) +
      columnFilters.filter((filter) => {
        const value = filter.value;
        if (value != null && typeof value === "object") {
          return isDateWindowActive(value);
        }
        return value != null && value !== "" && value !== "all";
      }).length
    );
  }, [columnFilters, globalFilter, legacyFilterValue, useGlobalSearch]);

  const clearFilters = () => {
    setGlobalFilter("");
    setLegacyFilterValue("");
    setColumnFilters([]);
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(undefined);
    }
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const showToolbar =
    showSearch ||
    filters.length > 0 ||
    Boolean(toolbar) ||
    enableColumnToggle ||
    Boolean(dateColumnId) ||
    Boolean(csvFilename) ||
    Boolean(onRefresh);

  const monthOptions = useMemo(() => {
    if (!dateColumnId) return [];
    const months = new Set<string>();
    for (const row of data) {
      const raw = (row as Record<string, unknown>)[dateColumnId];
      const ymd = String(raw ?? "")
        .trim()
        .slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        months.add(ymd.slice(0, 7));
      }
    }
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [data, dateColumnId]);

  const dateWindow = dateColumnId
    ? readDateWindow(table.getColumn(dateColumnId)?.getFilterValue())
    : {};

  const dateRangeSelected: DateRange | undefined =
    dateWindow.from || dateWindow.to
      ? {
          from: dateWindow.from ? parseYmd(dateWindow.from) : undefined,
          to: dateWindow.to ? parseYmd(dateWindow.to) : undefined,
        }
      : undefined;

  const patchDateWindow = (patch: Partial<DateWindowFilter>) => {
    if (!dateColumnId) return;
    const next: DateWindowFilter = { ...dateWindow };
    if ("months" in patch) {
      if (patch.months?.length) next.months = patch.months;
      else delete next.months;
    }
    if ("from" in patch) {
      if (patch.from) next.from = patch.from;
      else delete next.from;
    }
    if ("to" in patch) {
      if (patch.to) next.to = patch.to;
      else delete next.to;
    }
    table
      .getColumn(dateColumnId)
      ?.setFilterValue(isDateWindowActive(next) ? next : undefined);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const selectedMonth = dateWindow.months?.[0];

  const exportFilteredCsv = () => {
    if (!csvFilename) return;
    const exportColumns = table
      .getAllLeafColumns()
      .filter((column) => column.getIsVisible() && csvColumnLabel(column));
    const headers = exportColumns.map(
      (column) => csvColumnLabel(column) ?? column.id,
    );
    const rows = table
      .getFilteredRowModel()
      .rows.map((row) =>
        exportColumns.map((column) => row.getValue(column.id)),
      );
    downloadCsv(csvFilename, toCsv(headers, rows));
  };

  const filtersByColumnId = useMemo(() => {
    const map = new Map<string, DataTableFilterConfig>();
    for (const filter of filters) {
      map.set(filter.columnId, filter);
    }
    return map;
  }, [filters]);

  const autoWidths = useMemo(
    () => computeAutoWidths(columns, data, new Set(filtersByColumnId.keys())),
    [columns, data, filtersByColumnId],
  );

  const activeFilterValue = (columnId: string) => {
    const hit = columnFilters.find((filter) => filter.id === columnId);
    const value = hit?.value;
    if (value != null && typeof value === "object") return null;
    if (value == null || value === "" || value === "all") return null;
    return String(value);
  };

  const rowMatchesParents = (row: TData, parentIds: string[]): boolean => {
    for (const parentId of parentIds) {
      const parentValue = activeFilterValue(parentId);
      if (!parentValue) continue;
      const raw = (row as Record<string, unknown>)[parentId];
      if (Array.isArray(raw)) {
        if (!raw.map(String).includes(parentValue)) return false;
        continue;
      }
      if (String(raw ?? "") !== parentValue) return false;
    }
    return true;
  };

  const optionsForFilter = (filter: DataTableFilterConfig) => {
    const parents = filter.cascadeFrom ?? [];
    if (parents.length === 0) return filter.options;
    if (!parents.some((id) => activeFilterValue(id))) return filter.options;

    const present = new Set<string>();
    for (const row of data) {
      if (!rowMatchesParents(row, parents)) continue;
      const raw = (row as Record<string, unknown>)[filter.columnId];
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item != null && String(item).trim()) present.add(String(item));
        }
        continue;
      }
      if (raw != null && String(raw).trim()) present.add(String(raw));
    }

    return filter.options.filter((option) => present.has(option.value));
  };

  const setColumnFilterValue = (columnId: string, value: string) => {
    const next = value === "all" ? undefined : value;
    table.getColumn(columnId)?.setFilterValue(next);

    // Parent change clears dependent child filters.
    for (const filter of filters) {
      if (!filter.cascadeFrom?.includes(columnId)) continue;
      table.getColumn(filter.columnId)?.setFilterValue(undefined);
    }

    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide());

  const columnMenuSections = useMemo(() => {
    const sections: Array<{
      id: string;
      label: string | null;
      columns: typeof hideableColumns;
    }> = [];

    for (const column of hideableColumns) {
      const parent = column.parent;
      if (!parent) {
        sections.push({
          id: column.id,
          label: null,
          columns: [column],
        });
        continue;
      }

      const last = sections[sections.length - 1];
      if (last?.id === parent.id) {
        last.columns.push(column);
        continue;
      }

      const parentHeader = parent.columnDef.header;
      sections.push({
        id: parent.id,
        label:
          typeof parentHeader === "string" && parentHeader
            ? parentHeader
            : parent.id,
        columns: [column],
      });
    }

    const preferredOrder = ["main", "class"];
    for (const id of [...preferredOrder].reverse()) {
      const index = sections.findIndex((section) => section.id === id);
      if (index > 0) {
        const [section] = sections.splice(index, 1);
        if (section) {
          sections.unshift(section);
        }
      }
    }

    return sections;
  }, [hideableColumns]);

  const firstLeafColumnId = table.getVisibleLeafColumns()[0]?.id;

  /**
   * Columns menu: first pick from "all visible" solos that column;
   * further checks add columns; unchecking the last restores all.
   */
  const handleColumnVisibilityToggle = (columnId: string, checked: boolean) => {
    const visibleHideable = hideableColumns.filter((column) =>
      column.getIsVisible(),
    );
    const allVisible = visibleHideable.length === hideableColumns.length;

    if (allVisible) {
      const next: ColumnVisibilityState = {};
      for (const column of hideableColumns) {
        next[column.id] = column.id === columnId;
      }
      setColumnVisibility(next);
      return;
    }

    if (checked) {
      table.getColumn(columnId)?.toggleVisibility(true);
      return;
    }

    if (visibleHideable.length <= 1) {
      const next: ColumnVisibilityState = {};
      for (const column of hideableColumns) {
        next[column.id] = true;
      }
      setColumnVisibility(next);
      return;
    }

    table.getColumn(columnId)?.toggleVisibility(false);
  };

  const groupFilterSections = columnMenuSections.filter((section) =>
    section.columns.some((column) => Boolean(column.parent)),
  );

  const toggleGroupColumns = (
    section: (typeof groupFilterSections)[number],
  ) => {
    const anyVisible = section.columns.some((column) => column.getIsVisible());
    const next: ColumnVisibilityState = { ...columnVisibility };
    for (const column of section.columns) {
      next[column.id] = !anyVisible;
    }
    setColumnVisibility(next);
  };

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {showSearch ? (
              <Input
                placeholder={searchPlaceholder}
                value={useGlobalSearch ? globalFilter : legacyFilterValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (useGlobalSearch) {
                    setGlobalFilter(value);
                  } else if (searchKey) {
                    setLegacyFilterValue(value);
                    table.getColumn(searchKey)?.setFilterValue(value);
                  }
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
                className="w-full max-w-sm"
                aria-label={searchPlaceholder}
              />
            ) : null}
            {toolbar}
            {onRefresh ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void onRefresh();
                }}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </Button>
            ) : null}
            {csvFilename ? (
              <Button
                type="button"
                variant="outline"
                onClick={exportFilteredCsv}
                disabled={filteredCount === 0}
              >
                Export CSV
              </Button>
            ) : null}
            {enableColumnToggle ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Toggle columns"
                  render={<Button type="button" variant="outline" />}
                >
                  Columns
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-44">
                  {columnMenuSections.map((section, index) => {
                    const prev = columnMenuSections[index - 1];
                    const showSeparator =
                      index > 0 &&
                      (section.columns.length > 1 ||
                        (prev?.columns.length ?? 0) > 1);
                    return (
                      <DropdownMenuGroup key={section.id}>
                        {showSeparator ? <DropdownMenuSeparator /> : null}
                        {section.label ? (
                          <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                        ) : null}
                        {section.columns.map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            checked={column.getIsVisible()}
                            onCheckedChange={(checked) =>
                              handleColumnVisibilityToggle(
                                column.id,
                                Boolean(checked),
                              )
                            }
                          >
                            {menuColumnLabel(column)}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuGroup>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {dateColumnId ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Filter by month"
                    render={<Button type="button" variant="outline" />}
                  >
                    {selectedMonth ? formatMonthLabel(selectedMonth) : "Month"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-auto min-w-40"
                  >
                    <DropdownMenuRadioGroup
                      value={selectedMonth ?? "all"}
                      onValueChange={(value) => {
                        patchDateWindow({
                          months: value === "all" ? undefined : [value],
                        });
                      }}
                    >
                      <DropdownMenuLabel>Posted month</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioItem value="all">
                        All months
                      </DropdownMenuRadioItem>
                      {monthOptions.map((month) => (
                        <DropdownMenuRadioItem key={month} value={month}>
                          {formatMonthLabel(month)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Filter by date range"
                    >
                      <CalendarIcon
                        data-icon="inline-start"
                        className="opacity-70"
                      />
                      {formatRangeLabel(dateWindow.from, dateWindow.to)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto gap-4 p-3">
                    <Calendar
                      mode="range"
                      numberOfMonths={isMobile ? 1 : 2}
                      selected={dateRangeSelected}
                      onSelect={(range) => {
                        patchDateWindow({
                          from: range?.from ? formatYmd(range.from) : undefined,
                          to: range?.to ? formatYmd(range.to) : undefined,
                        });
                      }}
                      defaultMonth={
                        dateRangeSelected?.from ??
                        (monthOptions[0]
                          ? parseYmd(`${monthOptions[0]}-01`)
                          : undefined)
                      }
                    />
                    {dateWindow.from || dateWindow.to ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          patchDateWindow({ from: undefined, to: undefined })
                        }
                      >
                        Clear range
                      </Button>
                    ) : null}
                  </PopoverContent>
                </Popover>
              </>
            ) : null}
            {activeFilterCount > 0 ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-foreground-muted">
            Showing {filteredCount} of {totalCount}
            {activeFilterCount > 0 ? " (filtered)" : ""}
          </p>
        </div>
      ) : null}
      {groupFilterSections.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {groupFilterSections.map((section) => {
            const active = section.columns.some((column) =>
              column.getIsVisible(),
            );
            return (
              <Badge
                key={section.id}
                asChild
                variant={active ? "default" : "outline"}
                className="h-7 cursor-pointer px-2.5"
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleGroupColumns(section)}
                >
                  {section.label ?? section.id}
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
      <TooltipProvider>
        <div className="md:hidden">
          {table.getRowModel().rows?.length ? (
            <ul className="space-y-4">
              {table.getRowModel().rows.map((row) => {
                const visibleCells = row.getVisibleCells();
                const actionCells = visibleCells.filter(
                  (cell) => cell.column.id === "actions",
                );
                const dataCells = visibleCells.filter(
                  (cell) => cell.column.id !== "actions",
                );
                return (
                  <li key={row.id}>
                    <article
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className="rounded-xl border border-[var(--border)] bg-surface-elevated p-3"
                    >
                      {actionCells.length > 0 ? (
                        <div className="mb-2 flex justify-end gap-1">
                          {actionCells.map((cell) => (
                            <div key={cell.id}>
                              <table.FlexRender cell={cell} />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2">
                        {dataCells.map((cell) => (
                          <div key={cell.id} className="contents">
                            <dt className="pt-0.5 text-xs font-medium text-foreground-muted">
                              {csvColumnLabel(cell.column) ?? cell.column.id}
                            </dt>
                            <dd className="min-w-0 text-sm wrap-break-word [&_*]:whitespace-normal">
                              <table.FlexRender cell={cell} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-xl border border-[var(--border)] bg-surface-elevated px-4 py-10 text-center text-sm text-foreground-muted">
              {isLoading ? <Spinner className="size-6" /> : "No results."}
            </div>
          )}
        </div>
        <div className="hidden overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated md:block">
          <Table
            className={
              fillWidth
                ? "w-full min-w-max table-fixed"
                : "w-max min-w-max table-fixed"
            }
          >
            <colgroup>
              {table.getVisibleLeafColumns().map((column) => {
                const meta = withAutoWidth(
                  column.columnDef.meta as ColumnMeta | undefined,
                  column.id,
                  autoWidths,
                );
                const width = meta?.width;
                // Omit width on grow cols so leftover space does not
                // scale the actions column (table-fixed + w-full).
                if (!width || meta?.grow) {
                  return <col key={column.id} />;
                }
                return <col key={column.id} style={{ width }} />;
              })}
            </colgroup>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => {
                const isGroupTitleRow = headerGroup.headers.some(
                  (header) =>
                    header.subHeaders.length > 0 && !header.isPlaceholder,
                );
                if (isGroupTitleRow) return null;
                return (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      if (header.colSpan === 0) {
                        return null;
                      }
                      const isGroupParent =
                        header.subHeaders.length > 0 && !header.isPlaceholder;
                      const renderHeader = header;
                      const renderColumn = header.column;
                      const canSort = renderColumn.getCanSort();
                      const sorted = renderColumn.getIsSorted();
                      const columnFilter = filtersByColumnId.get(
                        renderColumn.id,
                      );
                      const filterValue =
                        (renderColumn.getFilterValue() as string | undefined) ??
                        "all";
                      const filterActive = Boolean(
                        columnFilter && filterValue !== "all",
                      );
                      const showGroupTitle = isGroupParent;
                      const columnMeta = withAutoWidth(
                        renderColumn.columnDef.meta as ColumnMeta | undefined,
                        renderColumn.id,
                        autoWidths,
                      );
                      const groupLeafMeta =
                        showGroupTitle && header.colSpan === 1
                          ? withAutoWidth(
                              header.subHeaders[0]?.column.columnDef.meta as
                                | ColumnMeta
                                | undefined,
                              header.subHeaders[0]?.column.id ?? "",
                              autoWidths,
                            )
                          : undefined;
                      const width = showGroupTitle
                        ? groupLeafMeta?.width
                        : columnMeta?.width;
                      const inventBand = columnMeta?.band === "invent";
                      const description = columnMeta?.description;
                      const isAmount = renderColumn.id === "amount";
                      const headerDef = renderColumn.columnDef.header;
                      const customHeader = typeof headerDef === "function";
                      const sortLabel =
                        csvColumnLabel(renderColumn) ?? renderColumn.id;
                      const isActionsCol = renderColumn.id === "actions";
                      const isStickyCol =
                        renderColumn.id === firstLeafColumnId ||
                        header.subHeaders.some(
                          (child) => child.column.id === firstLeafColumnId,
                        );
                      const headerRowSpan =
                        header.rowSpan > 1 ? header.rowSpan : undefined;
                      const labelNode = (
                        <HeaderLabel description={description}>
                          <span className="line-clamp-2 text-left leading-snug">
                            {customHeader ? (
                              sortLabel
                            ) : (
                              <table.FlexRender header={renderHeader} />
                            )}
                          </span>
                        </HeaderLabel>
                      );
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          rowSpan={headerRowSpan}
                          data-sticky-col={isStickyCol ? true : undefined}
                          style={columnSizeStyle(columnMeta)}
                          className={[
                            "h-auto min-h-10 whitespace-nowrap",
                            width ? "overflow-hidden" : "",
                            isActionsCol ? "w-10 max-w-10 px-0" : "",
                            showGroupTitle
                              ? "bg-[var(--muted)]/40 text-center text-xs font-semibold tracking-wide uppercase"
                              : "",
                            inventBand && !showGroupTitle
                              ? "border-l border-[var(--border)] bg-[var(--muted)]/35"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {showGroupTitle ? (
                            <span className="block px-2 py-1">
                              <table.FlexRender header={header} />
                            </span>
                          ) : header.isPlaceholder &&
                            header.rowSpan <= 1 ? null : canSort ||
                            columnFilter ? (
                            <div
                              className={`-ml-2 inline-flex max-w-full items-center gap-0.5 ${
                                isAmount ? "w-full justify-end" : ""
                              }`}
                            >
                              {canSort ? (
                                <button
                                  type="button"
                                  className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-[var(--muted)]"
                                  onClick={renderColumn.getToggleSortingHandler()}
                                >
                                  {labelNode}
                                  {sorted === "asc" ? (
                                    <ArrowUpIcon className="size-3.5 shrink-0 opacity-70" />
                                  ) : sorted === "desc" ? (
                                    <ArrowDownIcon className="size-3.5 shrink-0 opacity-70" />
                                  ) : (
                                    <ArrowUpDownIcon className="size-3.5 shrink-0 opacity-40" />
                                  )}
                                </button>
                              ) : (
                                <span className="px-2 py-1 font-medium">
                                  {labelNode}
                                </span>
                              )}
                              {customHeader ? (
                                <table.FlexRender header={renderHeader} />
                              ) : null}
                              {columnFilter ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    className={`inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${
                                      filterActive
                                        ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                                        : "text-foreground-muted opacity-50 hover:bg-[var(--muted)] hover:opacity-80"
                                    }`}
                                    aria-label={`Filter ${columnFilter.label}`}
                                    aria-pressed={filterActive}
                                  >
                                    <ListFilterIcon className="size-3.5" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    className="max-h-72 min-w-44"
                                  >
                                    <DropdownMenuRadioGroup
                                      value={filterValue}
                                      onValueChange={(value) =>
                                        setColumnFilterValue(
                                          columnFilter.columnId,
                                          value,
                                        )
                                      }
                                    >
                                      <DropdownMenuLabel>
                                        Filter {columnFilter.label}
                                      </DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuRadioItem value="all">
                                        {columnFilter.allLabel ??
                                          `All ${columnFilter.label.toLowerCase()}`}
                                      </DropdownMenuRadioItem>
                                      {optionsForFilter(columnFilter).map(
                                        (option) => (
                                          <DropdownMenuRadioItem
                                            key={option.value}
                                            value={option.value}
                                          >
                                            {option.label}
                                          </DropdownMenuRadioItem>
                                        ),
                                      )}
                                    </DropdownMenuRadioGroup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                            </div>
                          ) : (
                            <HeaderLabel description={description}>
                              <table.FlexRender header={renderHeader} />
                            </HeaderLabel>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const cellMeta = withAutoWidth(
                        cell.column.columnDef.meta as ColumnMeta | undefined,
                        cell.column.id,
                        autoWidths,
                      );
                      const width = cellMeta?.width;
                      const inventBand = cellMeta?.band === "invent";
                      const isActionsCol = cell.column.id === "actions";
                      const wrap = cellMeta?.wrap === true;
                      return (
                        <TableCell
                          key={cell.id}
                          data-sticky-col={
                            cell.column.id === firstLeafColumnId
                              ? true
                              : undefined
                          }
                          style={columnSizeStyle(cellMeta)}
                          className={[
                            wrap
                              ? "whitespace-normal align-top"
                              : "overflow-hidden text-ellipsis whitespace-nowrap align-middle",
                            width ? "overflow-hidden" : "",
                            isActionsCol ? "w-10 max-w-10 px-0" : "",
                            inventBand
                              ? "border-l border-[var(--border)] bg-[var(--muted)]/20"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={Math.max(table.getVisibleLeafColumns().length, 1)}
                    className="h-40 text-center text-foreground-muted"
                  >
                    {isLoading ? (
                      <span className="inline-flex w-full items-center justify-center">
                        <Spinner className="size-6" />
                      </span>
                    ) : (
                      "No results."
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground-muted">
          Page {pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
