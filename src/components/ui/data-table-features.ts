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
import fuzzysort from "fuzzysort";

const filterFn_fuzzy: FilterFn<any, RowData> = (
  row,
  columnId,
  filterValue,
) => {
  const query = String(filterValue ?? "").trim();
  if (!query) return true;
  const value = row.getValue(columnId);
  if (value == null || value === "") return false;
  const target = Array.isArray(value) ? value.join(" ") : String(value);
  if (!target) return false;
  return fuzzysort.single(query, target) != null;
};

filterFn_fuzzy.autoRemove = (value) => !String(value ?? "").trim();

const filterFn_amountDirection: FilterFn<any, RowData> = (
  row,
  columnId,
  filterValue,
) => {
  const direction = String(filterValue ?? "");
  if (!direction || direction === "all") return true;
  const amount = Number(row.getValue(columnId));
  if (direction === "spend") return amount > 0;
  if (direction === "income") return amount < 0;
  return true;
};

filterFn_amountDirection.autoRemove = (value) =>
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
  return tags.some(
    (tag) => String(tag).toLowerCase() === wanted.toLowerCase(),
  );
};

filterFn_includesTag.autoRemove = (value) =>
  !value || value === "all" || value === "";

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
    amountDirection: filterFn_amountDirection,
    includesTag: filterFn_includesTag,
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
