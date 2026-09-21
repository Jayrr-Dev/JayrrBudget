import {
  columnFilteringFeature,
  columnVisibilityFeature,
  constructSortFn,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type FilterFn,
  type RowData,
} from "@tanstack/react-table";
import { amountMatchesLogRange } from "@/domains/transactions/domain/amountLogRange";
import fuzzysort from "fuzzysort";

const filterFn_fuzzy: FilterFn<any, RowData> = (row, columnId, filterValue) => {
  const query = String(filterValue ?? "").trim();
  if (!query) return true;
  const value = row.getValue(columnId);
  if (value == null || value === "") return false;
  const target = Array.isArray(value) ? value.join(" ") : String(value);
  if (!target) return false;
  return fuzzysort.single(query, target) != null;
};

filterFn_fuzzy.autoRemove = (value) => !String(value ?? "").trim();

const filterFn_amountLogRange: FilterFn<any, RowData> = (
  row,
  columnId,
  filterValue,
) => {
  const key = String(filterValue ?? "");
  if (!key || key === "all") return true;
  const amount = Number(row.getValue(columnId));
  return amountMatchesLogRange(amount, key);
};

filterFn_amountLogRange.autoRemove = (value) =>
  !value || value === "all" || value === "";

const filterFn_includesTag: FilterFn<any, RowData> = (
  row,
  columnId,
  filterValue,
) => {
  const wanted = String(filterValue ?? "").trim();
  if (!wanted || wanted === "all") return true;
  const tags = row.getValue(columnId);
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => String(tag).toLowerCase() === wanted.toLowerCase());
};

filterFn_includesTag.autoRemove = (value) =>
  !value || value === "all" || value === "";

/** Header menu: one value, or any of several selected values. */
const filterFn_oneOf: FilterFn<any, RowData> = (row, columnId, filterValue) => {
  const wanted = selectedOneOf(filterValue);
  if (wanted.length === 0) return true;
  const raw = row.getValue(columnId);
  const cell = Array.isArray(raw)
    ? raw.map((item) => String(item))
    : [String(raw ?? "")];
  return wanted.some((item) => cell.includes(item));
};

filterFn_oneOf.autoRemove = (value) => selectedOneOf(value).length === 0;

function selectedOneOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item && item !== "all");
  }
  if (value == null || value === "" || value === "all") return [];
  return [String(value)];
}

/** Posted-date toolbar filter: YYYY-MM months and/or YYYY-MM-DD range. */
export type DateWindowFilter = {
  /** Selected YYYY-MM keys. Empty/absent = all months. */
  months?: string[];
  from?: string;
  to?: string;
};

export function isDateWindowActive(value: unknown): value is DateWindowFilter {
  if (!value || typeof value !== "object") return false;
  const window = value as DateWindowFilter & { month?: string };
  const months = window.months ?? (window.month ? [window.month] : undefined);
  return Boolean((months && months.length > 0) || window.from || window.to);
}

function toDateKey(value: unknown): string | null {
  const raw = String(value ?? "")
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

const filterFn_dateWindow: FilterFn<any, RowData> = (
  row,
  columnId,
  filterValue,
) => {
  if (!isDateWindowActive(filterValue)) return true;
  const date = toDateKey(row.getValue(columnId));
  if (!date) return false;
  const legacy = filterValue as DateWindowFilter & { month?: string };
  const months =
    filterValue.months ?? (legacy.month ? [legacy.month] : undefined);
  if (months?.length && !months.some((month) => date.startsWith(month))) {
    return false;
  }
  if (filterValue.from && date < filterValue.from) return false;
  if (filterValue.to && date > filterValue.to) return false;
  return true;
};

filterFn_dateWindow.autoRemove = (value) => !isDateWindowActive(value);

function toTextListValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").replaceAll("_", " "))
      .filter(Boolean)
      .join(" ");
  }
  if (value == null || value === "") return "";
  return String(value).replaceAll("_", " ");
}

const sortFn_textList = constructSortFn({
  ...sortFn_text,
  resolveDataValue: (value) =>
    sortFn_text.resolveDataValue!(toTextListValue(value)),
});

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    equalsString: filterFn_equalsString,
    fuzzy: filterFn_fuzzy,
    amountLogRange: filterFn_amountLogRange,
    includesTag: filterFn_includesTag,
    oneOf: filterFn_oneOf,
    dateWindow: filterFn_dateWindow,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textList: sortFn_textList,
  },
});

export type DataTableFeatures = typeof dataTableFeatures;
