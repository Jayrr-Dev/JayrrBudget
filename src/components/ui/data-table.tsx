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
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  dataTableFeatures,
  type DataTableFeatures,
} from "@/components/ui/data-table-features";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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

export type DataTableFilterOption = {
  label: string;
  value: string;
};

export type DataTableFilterConfig = {
  columnId: string;
  label: string;
  options: DataTableFilterOption[];
  allLabel?: string;
};

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  enableGlobalFilter?: boolean;
  globalFilterFn?: "fuzzy" | "includesString";
  filters?: DataTableFilterConfig[];
  initialSorting?: SortingState;
  initialColumnVisibility?: ColumnVisibilityState;
  pageSize?: number;
  toolbar?: ReactNode;
  enableColumnToggle?: boolean;
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
    showSearch || filters.length > 0 || Boolean(toolbar) || enableColumnToggle;

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
            {filters.map((filter) => {
              const current =
                (table.getColumn(filter.columnId)?.getFilterValue() as
                  | string
                  | undefined) ?? "all";
              return (
                <NativeSelect
                  key={filter.columnId}
                  aria-label={filter.label}
                  value={current}
                  onChange={(event) => {
                    const value = event.target.value;
                    table
                      .getColumn(filter.columnId)
                      ?.setFilterValue(value === "all" ? undefined : value);
                    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                  }}
                  className="min-w-[9.5rem]"
                >
                  <NativeSelectOption value="all">
                    {filter.allLabel ?? `All ${filter.label.toLowerCase()}`}
                  </NativeSelectOption>
                  {filter.options.map((option) => (
                    <NativeSelectOption
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              );
            })}
            {toolbar}
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
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const width = (
                    header.column.columnDef.meta as
                      | { width?: string }
                      | undefined
                  )?.width;
                  return (
                    <TableHead
                      key={header.id}
                      style={width ? { width } : undefined}
                      className={width ? "overflow-hidden" : undefined}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className={`-ml-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-[var(--muted)] ${
                            header.column.id === "amount"
                              ? "w-full justify-end"
                              : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="truncate">
                            <table.FlexRender header={header} />
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
                        style={width ? { width } : undefined}
                        className={width ? "max-w-0 overflow-hidden" : undefined}
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
