"use client";

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
  ArrowUpIcon,
  ArrowUpDownIcon,
  ListFilterIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  dataTableFeatures,
  type DataTableFeatures,
} from "@/components/ui/data-table-features";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/shared/lib/csv";

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
  initialSorting?: SortingState;
  initialColumnVisibility?: ColumnVisibilityState;
  pageSize?: number;
  toolbar?: ReactNode;
  enableColumnToggle?: boolean;
  /** When set, toolbar shows Export CSV for filtered rows. */
  csvFilename?: string;
  /** When set, toolbar shows Refresh to reload table data. */
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
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

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Filter…",
  enableGlobalFilter = false,
  globalFilterFn = "fuzzy",
  filters = [],
  initialSorting = [],
  initialColumnVisibility = {},
  pageSize = 10,
  toolbar,
  enableColumnToggle = false,
  csvFilename,
  onRefresh,
  isRefreshing = false,
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
    Boolean(csvFilename) ||
    Boolean(onRefresh);

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

  const activeFilterValue = (columnId: string) => {
    const hit = columnFilters.find((filter) => filter.id === columnId);
    const value = hit?.value;
    if (value == null || value === "" || value === "all") return null;
    return String(value);
  };

  const rowMatchesParents = (
    row: TData,
    parentIds: string[],
  ): boolean => {
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

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="flex flex-col gap-3">
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
                className="max-w-sm"
                aria-label={searchPlaceholder}
              />
            ) : null}
            {toolbar}
            {onRefresh ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
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
                size="sm"
                onClick={exportFilteredCsv}
                disabled={filteredCount === 0}
              >
                Export CSV
              </Button>
            ) : null}
            {enableColumnToggle ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 text-sm font-medium hover:bg-[var(--muted)]"
                  aria-label="Toggle columns"
                >
                  Columns
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-40">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      const meta = column.columnDef.meta as
                        | { label?: string }
                        | undefined;
                      const header = column.columnDef.header;
                      const label =
                        meta?.label ??
                        (typeof header === "string" && header
                          ? header
                          : column.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          checked={column.getIsVisible()}
                          onCheckedChange={(checked) =>
                            column.toggleVisibility(Boolean(checked))
                          }
                        >
                          {label}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Showing {filteredCount} of {totalCount}
            {activeFilterCount > 0 ? " (filtered)" : ""}
          </p>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <Table className="min-w-max table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const columnFilter = filtersByColumnId.get(header.column.id);
                  const filterValue =
                    (header.column.getFilterValue() as string | undefined) ??
                    "all";
                  const filterActive = Boolean(
                    columnFilter && filterValue !== "all",
                  );
                  const width = (
                    header.column.columnDef.meta as
                      | { width?: string }
                      | undefined
                  )?.width;
                  const isAmount = header.column.id === "amount";
                  const headerDef = header.column.columnDef.header;
                  const customHeader = typeof headerDef === "function";
                  const sortLabel =
                    csvColumnLabel(header.column) ?? header.column.id;
                  return (
                    <TableHead
                      key={header.id}
                      style={
                        width
                          ? { width, minWidth: width, maxWidth: width }
                          : undefined
                      }
                      className={
                        width
                          ? "h-auto min-h-10 overflow-hidden whitespace-normal"
                          : "h-auto min-h-10 whitespace-normal"
                      }
                    >
                      {header.isPlaceholder ? null : canSort || columnFilter ? (
                        <div
                          className={`-ml-2 inline-flex max-w-full items-center gap-0.5 ${
                            isAmount ? "w-full justify-end" : ""
                          }`}
                        >
                          {canSort ? (
                            <button
                              type="button"
                              className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-[var(--muted)]"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              <span className="line-clamp-2 text-left leading-snug">
                                {customHeader ? (
                                  sortLabel
                                ) : (
                                  <table.FlexRender header={header} />
                                )}
                              </span>
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
                              <span className="line-clamp-2 text-left leading-snug">
                                {customHeader ? (
                                  sortLabel
                                ) : (
                                  <table.FlexRender header={header} />
                                )}
                              </span>
                            </span>
                          )}
                          {customHeader ? (
                            <table.FlexRender header={header} />
                          ) : null}
                          {columnFilter ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={`inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${
                                  filterActive
                                    ? "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)]/90"
                                    : "text-[var(--muted-foreground)] opacity-50 hover:bg-[var(--muted)] hover:opacity-80"
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
                                  {optionsForFilter(columnFilter).map((option) => (
                                    <DropdownMenuRadioItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </DropdownMenuRadioItem>
                                  ))}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => {
                    const width = (
                      cell.column.columnDef.meta as
                        | { width?: string }
                        | undefined
                    )?.width;
                    return (
                      <TableCell
                        key={cell.id}
                        style={
                          width
                            ? { width, minWidth: width, maxWidth: width }
                            : undefined
                        }
                        className={
                          width
                            ? "overflow-hidden whitespace-normal align-top"
                            : "whitespace-normal align-top"
                        }
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
                  colSpan={columns.length}
                  className="h-24 text-center text-[var(--muted-foreground)]"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
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
