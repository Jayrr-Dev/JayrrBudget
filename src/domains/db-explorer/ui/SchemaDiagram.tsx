"use client";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DbColumnInfo,
  DbForeignKey,
  DbTableInfo,
} from "@/domains/db-explorer/domain/types";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Braces,
  Calendar,
  ChevronDown,
  Fingerprint,
  Hash,
  HelpCircle,
  KeyRound,
  ToggleLeft,
  Type,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

const NODE_W = 230;
const NODE_H_BASE = 48;
const ROW_H = 18;
const COL_GAP = NODE_W;
const ROW_GAP = 36;
const PAD = 48;
const LAYOUT_ID = "domain-columns-v1";
const MAX_VISIBLE_COLS = 8;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

/**
 * Fixed schema columns (left → right), matching the db-explorer mental model:
 * hubs/sources, then accounts + lookups, then categories.
 * Unknown tables fall back to required-FK depth.
 */
const PREFERRED_COLUMN: Record<string, number> = {
  institutions: 0,
  statement_uploads: 0,
  transactions: 0,
  accounts: 1,
  app_modules: 1,
  transaction_sections: 1,
  transaction_spreads: 1,
  transaction_subcategories: 1,
  transaction_types: 1,
  transaction_kinds: 1,
  transaction_categories: 2,
};

/** Top → bottom order inside each preferred column. */
const PREFERRED_ROW: Record<string, number> = {
  institutions: 0,
  statement_uploads: 1,
  transactions: 2,
  accounts: 0,
  app_modules: 1,
  transaction_sections: 2,
  transaction_spreads: 3,
  transaction_subcategories: 4,
  transaction_types: 5,
  transaction_kinds: 6,
  transaction_categories: 2,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type Point = { x: number; y: number };

type LayoutSeed = {
  name: string;
  x: number;
  y: number;
};

function fkIsRequired(
  fk: DbForeignKey,
  tablesByName: Map<string, DbTableInfo>,
) {
  const from = tablesByName.get(fk.fromTable);
  if (!from) return true;
  return fk.fromColumns.every((colName) => {
    const col = from.columns.find((c) => c.name === colName);
    return Boolean(col?.notNull);
  });
}

function requiredForeignKeys(tables: DbTableInfo[], fks: DbForeignKey[]) {
  const tablesByName = new Map(tables.map((table) => [table.name, table]));
  return fks.filter(
    (fk) => fk.fromTable !== fk.toTable && fkIsRequired(fk, tablesByName),
  );
}

function layerForTables(tables: DbTableInfo[], fks: DbForeignKey[]) {
  const names = tables.map((t) => t.name);
  const required = requiredForeignKeys(tables, fks);
  const depth = new Map<string, number>(names.map((n) => [n, 0]));
  for (let pass = 0; pass < names.length; pass += 1) {
    for (const fk of required) {
      const parent = depth.get(fk.toTable) ?? 0;
      const child = depth.get(fk.fromTable) ?? 0;
      if (child <= parent) depth.set(fk.fromTable, parent + 1);
    }
  }
  const layers = new Map<number, string[]>();
  for (const name of names) {
    const d = depth.get(name) ?? 0;
    const list = layers.get(d) ?? [];
    list.push(name);
    layers.set(d, list);
  }
  return { layers, required };
}

function orderLayerNames(
  layers: Map<number, string[]>,
  required: DbForeignKey[],
  nameOrder: Map<string, number>,
) {
  const depths = [...layers.keys()].sort((a, b) => a - b);
  const ordered = new Map<number, string[]>();
  const indexOf = new Map<string, number>();

  for (const depth of depths) {
    const names = [...(layers.get(depth) ?? [])];
    names.sort((a, b) => {
      if (depth === 0) {
        return (nameOrder.get(a) ?? 0) - (nameOrder.get(b) ?? 0);
      }
      const score = (name: string) => {
        const parentIdx = required
          .filter((fk) => fk.fromTable === name)
          .map((fk) => indexOf.get(fk.toTable))
          .filter((value): value is number => value !== undefined);
        if (parentIdx.length === 0) return Number.POSITIVE_INFINITY;
        return (
          parentIdx.reduce((sum, value) => sum + value, 0) / parentIdx.length
        );
      };
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa - sb;
      return (nameOrder.get(a) ?? 0) - (nameOrder.get(b) ?? 0);
    });
    names.forEach((name, index) => indexOf.set(name, index));
    ordered.set(depth, names);
  }
  return ordered;
}

const SEP_H = 8;
const COL_HEAD_H = 18;

type ColSortField = "name" | "type" | "flag";
type ColSort = { by: "grouped" } | { by: ColSortField; dir: "asc" | "desc" };

const GROUPED_SORT: ColSort = { by: "grouped" };

function cycleColSortState(current: ColSort, field: ColSortField): ColSort {
  if (current.by !== field) return { by: field, dir: "asc" };
  if (current.dir === "asc") return { by: field, dir: "desc" };
  return GROUPED_SORT;
}

function flagRank(col: DbColumnInfo) {
  if (col.primaryKey) return 0;
  if (col.unique) return 1;
  return 2;
}

function sortedFlatColumns(columns: DbColumnInfo[], sort: ColSort) {
  if (sort.by === "grouped") return columns;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...columns].sort((a, b) => {
    if (sort.by === "name") return a.name.localeCompare(b.name) * dir;
    if (sort.by === "flag") {
      const rank = flagRank(a) - flagRank(b);
      if (rank !== 0) return rank * dir;
      return a.name.localeCompare(b.name);
    }
    const typeCmp = a.dataType.localeCompare(b.dataType);
    if (typeCmp !== 0) return typeCmp * dir;
    return a.name.localeCompare(b.name);
  });
}

function nodeHeight(
  table: DbTableInfo,
  expanded: boolean,
  openPrefixes: Set<string> = new Set(),
  sort: ColSort = GROUPED_SORT,
) {
  const header = headerHeightFor(table.name);
  if (!expanded) return header;
  if (sort.by !== "grouped") {
    return (
      header +
      COL_HEAD_H +
      Math.min(table.columns.length, MAX_VISIBLE_COLS) * ROW_H +
      16
    );
  }
  const sections = columnSections(table.columns);
  const rows = visibleRowCount(
    [...sections.loose, ...sections.prefix, ...sections.suffix],
    openPrefixes,
  );
  return (
    header +
    COL_HEAD_H +
    Math.min(rows, MAX_VISIBLE_COLS) * ROW_H +
    sectionSepCount(sections) * SEP_H +
    16
  );
}

/** Hubs left, lookups mid/right. Preferred map first; else required-FK depth. */
function seedLayout(tables: DbTableInfo[], fks: DbForeignKey[]): LayoutSeed[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const { layers, required } = layerForTables(tables, fks);
  const nameOrder = new Map(tables.map((table, index) => [table.name, index]));
  const ordered = orderLayerNames(layers, required, nameOrder);
  const colPitch = NODE_W + COL_GAP;
  const rowPitch = NODE_H_BASE + ROW_GAP;
  const placed = new Map<string, Point>();

  const columnOf = (name: string) => {
    if (name in PREFERRED_COLUMN) return PREFERRED_COLUMN[name];
    for (const [depth, names] of ordered) {
      if (names.includes(name)) return depth;
    }
    return 0;
  };

  const byColumn = new Map<number, string[]>();
  for (const table of tables) {
    if (!byName.has(table.name)) continue;
    const col = columnOf(table.name);
    const list = byColumn.get(col) ?? [];
    list.push(table.name);
    byColumn.set(col, list);
  }

  for (const [col, names] of [...byColumn.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    names.sort((a, b) => {
      const ra = PREFERRED_ROW[a];
      const rb = PREFERRED_ROW[b];
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
      if (ra !== undefined && rb === undefined) return -1;
      if (ra === undefined && rb !== undefined) return 1;
      const parentScore = (name: string) => {
        const parentIdx = required
          .filter((fk) => fk.fromTable === name)
          .map((fk) => {
            const parent = fk.toTable;
            const parentCol = columnOf(parent);
            if (parentCol >= col) return Number.POSITIVE_INFINITY;
            return PREFERRED_ROW[parent] ?? nameOrder.get(parent) ?? 0;
          })
          .filter((value) => Number.isFinite(value));
        if (parentIdx.length === 0) return Number.POSITIVE_INFINITY;
        return (
          parentIdx.reduce((sum, value) => sum + value, 0) / parentIdx.length
        );
      };
      const sa = parentScore(a);
      const sb = parentScore(b);
      if (sa !== sb) return sa - sb;
      return (nameOrder.get(a) ?? 0) - (nameOrder.get(b) ?? 0);
    });

    const x = PAD + col * colPitch;
    const usedY: number[] = [];
    for (const name of names) {
      const preferredY =
        PREFERRED_ROW[name] !== undefined
          ? PAD + PREFERRED_ROW[name] * rowPitch
          : undefined;
      const parentYs = required
        .filter((fk) => fk.fromTable === name)
        .map((fk) => placed.get(fk.toTable)?.y)
        .filter((value): value is number => value !== undefined);
      let y =
        preferredY ??
        (parentYs.length > 0
          ? parentYs.reduce((sum, value) => sum + value, 0) / parentYs.length
          : PAD + names.indexOf(name) * rowPitch);
      while (usedY.some((taken) => Math.abs(taken - y) < rowPitch)) {
        y += rowPitch;
      }
      usedY.push(y);
      placed.set(name, { x, y });
    }
  }

  return [...placed.entries()].map(([name, point]) => ({ name, ...point }));
}

/**
 * Same-column cards only. Push lower cards down when one above grows.
 * Never pull up — keeps manual spacing on collapse.
 */
function pushDownColumnOverlaps(
  positions: Record<string, Point>,
  heights: Record<string, number>,
  gap: number,
): Record<string, Point> | null {
  const byCol = new Map<number, string[]>();
  for (const name of Object.keys(positions)) {
    const col = Math.round(positions[name].x);
    const list = byCol.get(col) ?? [];
    list.push(name);
    byCol.set(col, list);
  }

  let changed = false;
  const next: Record<string, Point> = { ...positions };

  for (const names of byCol.values()) {
    names.sort((a, b) => {
      const dy = next[a].y - next[b].y;
      if (dy !== 0) return dy;
      return a.localeCompare(b);
    });
    let floor = Number.NEGATIVE_INFINITY;
    for (const name of names) {
      const h = heights[name] ?? NODE_H_BASE;
      let y = next[name].y;
      if (floor !== Number.NEGATIVE_INFINITY && y < floor + gap) {
        y = floor + gap;
        next[name] = { x: next[name].x, y };
        changed = true;
      }
      floor = y + h;
    }
  }

  return changed ? next : null;
}

/** `transaction_enrichment` → `Transaction Enrichment` */
function formatTableLabel(name: string) {
  return name
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function headerHeightFor(name: string) {
  const label = formatTableLabel(name);
  // Title column ~9.5rem; ~15 chars/line at text-sm.
  const lines = Math.min(2, Math.max(1, Math.ceil(label.length / 15)));
  return Math.max(NODE_H_BASE, 14 + lines * 18);
}

function flagKind(col: { primaryKey: boolean; unique: boolean }) {
  if (col.primaryKey) return "pk";
  if (col.unique) return "uq";
  return null;
}

function FlagGlyph({ col }: { col: DbColumnInfo }) {
  const kind = flagKind(col);
  if (!kind) return <span className="w-5 shrink-0" />;
  const isPk = kind === "pk";
  const Glyph = isPk ? KeyRound : Fingerprint;
  const label = isPk ? "Primary key" : "Unique";
  const hint = isPk
    ? "Primary key. This row's name tag. Other tables point here."
    : "Unique. No two rows can share this value.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex w-5 shrink-0 cursor-help items-center justify-center text-[var(--muted-foreground)] opacity-80 hover:text-[var(--foreground)] hover:opacity-100"
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Glyph className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={6}
        className="max-w-xs font-sans text-xs leading-snug"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function typeGlyph(dataType: string) {
  switch (dataType.toLowerCase()) {
    case "string":
    case "text":
      return Type;
    case "number":
    case "integer":
    case "bigint":
    case "real":
    case "float":
    case "numeric":
      return Hash;
    case "date":
    case "datetime":
    case "timestamp":
      return Calendar;
    case "boolean":
      return ToggleLeft;
    case "json":
      return Braces;
    default:
      return HelpCircle;
  }
}

function TypeGlyph({ dataType }: { dataType: string }) {
  const Glyph = typeGlyph(dataType);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-[var(--muted-foreground)] opacity-80 hover:text-[var(--foreground)] hover:opacity-100"
          aria-label={dataType}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Glyph className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        sideOffset={6}
        className="font-mono capitalize"
      >
        {dataType}
      </TooltipContent>
    </Tooltip>
  );
}

function columnPrefix(name: string) {
  const index = name.indexOf("_");
  if (index <= 0) return null;
  return name.slice(0, index);
}

function columnSuffixToken(name: string) {
  const index = name.lastIndexOf("_");
  if (index < 0) return name;
  return name.slice(index + 1);
}

type ColumnGroup =
  | { kind: "col"; col: DbColumnInfo }
  | {
      kind: "group";
      key: string;
      label: string;
      token: string;
      strip: "prefix" | "suffix";
      columns: DbColumnInfo[];
    };

type ColumnSections = {
  loose: ColumnGroup[];
  prefix: Extract<ColumnGroup, { kind: "group" }>[];
  suffix: Extract<ColumnGroup, { kind: "group" }>[];
};

function columnSections(columns: DbColumnInfo[]): ColumnSections {
  const prefixCounts = new Map<string, number>();
  for (const col of columns) {
    const prefix = columnPrefix(col.name);
    if (!prefix) continue;
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const leftovers = columns.filter((col) => {
    const prefix = columnPrefix(col.name);
    return !prefix || (prefixCounts.get(prefix) ?? 0) < 2;
  });

  const suffixCounts = new Map<string, number>();
  for (const col of leftovers) {
    const suffix = columnSuffixToken(col.name);
    suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
  }

  const seenPrefix = new Set<string>();
  const seenSuffix = new Set<string>();
  const loose: ColumnGroup[] = [];
  const prefixGroups: Extract<ColumnGroup, { kind: "group" }>[] = [];
  const suffixGroups: Extract<ColumnGroup, { kind: "group" }>[] = [];

  for (const col of columns) {
    const prefix = columnPrefix(col.name);
    if (prefix && (prefixCounts.get(prefix) ?? 0) >= 2) {
      if (seenPrefix.has(prefix)) continue;
      seenPrefix.add(prefix);
      prefixGroups.push({
        kind: "group",
        key: `pre:${prefix}`,
        label: `${formatPrefix(prefix)} (p)`,
        token: prefix,
        strip: "prefix",
        columns: columns.filter((item) => columnPrefix(item.name) === prefix),
      });
      continue;
    }

    const suffix = columnSuffixToken(col.name);
    if ((suffixCounts.get(suffix) ?? 0) >= 2) {
      if (seenSuffix.has(suffix)) continue;
      seenSuffix.add(suffix);
      suffixGroups.push({
        kind: "group",
        key: `suf:${suffix}`,
        label: formatSuffixGroup(suffix),
        token: suffix,
        strip: "suffix",
        columns: leftovers.filter(
          (item) => columnSuffixToken(item.name) === suffix,
        ),
      });
      continue;
    }

    loose.push({ kind: "col", col });
  }

  return { loose, prefix: prefixGroups, suffix: suffixGroups };
}

function groupColumns(columns: DbColumnInfo[]): ColumnGroup[] {
  const sections = columnSections(columns);
  return [...sections.loose, ...sections.prefix, ...sections.suffix];
}

function sectionSepCount(sections: ColumnSections) {
  const blocks = [
    sections.loose.length > 0,
    sections.prefix.length > 0,
    sections.suffix.length > 0,
  ].filter(Boolean).length;
  return Math.max(0, blocks - 1);
}

function visibleRowCount(
  groups: ColumnGroup[],
  openPrefixes: Set<string> | undefined,
) {
  const open = openPrefixes ?? new Set<string>();
  let rows = 0;
  for (const item of groups) {
    if (item.kind === "col") {
      rows += 1;
      continue;
    }
    rows += 1;
    if (open.has(item.key)) rows += item.columns.length;
  }
  return rows;
}

function formatPrefix(prefix: string) {
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
}

function formatSuffixGroup(suffix: string) {
  return `${formatPrefix(suffix)} (s)`;
}

function stripPrefix(name: string, prefix: string) {
  const lead = `${prefix}_`;
  return name.startsWith(lead) ? name.slice(lead.length) : name;
}

function groupChildLabel(
  name: string,
  group: Extract<ColumnGroup, { kind: "group" }>,
) {
  return group.strip === "prefix" ? stripPrefix(name, group.token) : name;
}

function groupKey(table: string, prefix: string) {
  return `${table}::${prefix}`;
}

function openPrefixesFor(
  table: string,
  openColGroups: Set<string> | undefined,
) {
  const lead = `${table}::`;
  const prefixes = new Set<string>();
  if (!openColGroups) return prefixes;
  for (const key of openColGroups) {
    if (key.startsWith(lead)) prefixes.add(key.slice(lead.length));
  }
  return prefixes;
}

function ColumnRow({
  col,
  label,
  indent = false,
}: {
  col: DbColumnInfo;
  label?: string;
  indent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[18px] items-center gap-2 font-mono text-[11px] leading-[18px]",
        indent && "pl-3",
      )}
    >
      <FlagGlyph col={col} />
      <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">
        {col.description ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="max-w-full cursor-pointer truncate text-left underline-offset-2 hover:underline"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                {label ?? col.name}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              collisionPadding={16}
              className="w-fit max-w-xs bg-[var(--foreground)] p-2 font-sans text-xs leading-snug text-[var(--background)] shadow-md ring-0"
            >
              {col.description}
            </PopoverContent>
          </Popover>
        ) : (
          (label ?? col.name)
        )}
      </span>
      <TypeGlyph dataType={col.dataType} />
    </div>
  );
}

function sortGlyph(sort: ColSort, field: ColSortField) {
  if (sort.by !== field) return ArrowUpDown;
  return sort.dir === "asc" ? ArrowDown : ArrowUp;
}

function sortAria(sort: ColSort, field: ColSortField) {
  if (field === "name") {
    if (sort.by !== "name") return "Sort columns A to Z";
    if (sort.dir === "asc") return "Sort columns Z to A";
    return "Clear column sort";
  }
  if (field === "flag") {
    if (sort.by !== "flag") return "Sort keys first";
    if (sort.dir === "asc") return "Sort keys last";
    return "Clear key sort";
  }
  if (sort.by !== "type") return "Sort by type";
  if (sort.dir === "asc") return "Sort type reverse";
  return "Clear type sort";
}

function ColumnListHeader({
  sort,
  onCycleName,
  onCycleType,
  onCycleFlag,
}: {
  sort: ColSort;
  onCycleName: () => void;
  onCycleType: () => void;
  onCycleFlag: () => void;
}) {
  const NameSortIcon = sortGlyph(sort, "name");
  const TypeSortIcon = sortGlyph(sort, "type");
  const FlagSortIcon = sortGlyph(sort, "flag");
  return (
    <div className="sticky top-0 z-10 mb-0.5 flex h-[18px] items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] font-mono text-[10px] leading-[18px] text-[var(--muted-foreground)]">
      <button
        type="button"
        className="inline-flex w-5 shrink-0 items-center justify-center"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCycleFlag();
        }}
        aria-label={sortAria(sort, "flag")}
        title={sortAria(sort, "flag")}
      >
        {sort.by === "flag" ? (
          <FlagSortIcon className="size-3" strokeWidth={2} aria-hidden />
        ) : (
          <KeyRound className="size-3 opacity-70" strokeWidth={2} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left uppercase"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCycleName();
        }}
        aria-label={sortAria(sort, "name")}
        title={sortAria(sort, "name")}
      >
        <span>column</span>
        <NameSortIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="inline-flex size-4 shrink-0 items-center justify-center"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCycleType();
        }}
        aria-label={sortAria(sort, "type")}
        title={sortAria(sort, "type")}
      >
        {sort.by === "type" ? (
          <TypeSortIcon className="size-3" strokeWidth={2} aria-hidden />
        ) : (
          <Type className="size-3 opacity-70" strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

function GroupAccordion({
  item,
  tableName,
  isOpen,
  onToggleGroup,
}: {
  item: Extract<ColumnGroup, { kind: "group" }>;
  tableName: string;
  isOpen: boolean;
  onToggleGroup: (table: string, prefix: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex h-[18px] w-full items-center gap-2 text-left font-mono text-[11px] leading-[18px] text-[var(--foreground)]"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleGroup(tableName, item.key);
        }}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.label} columns`}
      >
        <span className="w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform",
            isOpen && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {isOpen
        ? item.columns.map((col) => (
            <ColumnRow
              key={col.name}
              col={col}
              indent
              label={groupChildLabel(col.name, item)}
            />
          ))
        : null}
    </div>
  );
}

function ColumnSep() {
  return (
    <div
      className="my-1 border-t border-[var(--border)]/70"
      style={{ height: SEP_H }}
      aria-hidden
    />
  );
}

function ColumnRows({
  tableName,
  columns,
  openPrefixes,
  onToggleGroup,
  sort = GROUPED_SORT,
}: {
  tableName: string;
  columns: DbColumnInfo[];
  openPrefixes: Set<string> | undefined;
  onToggleGroup: (table: string, prefix: string) => void;
  sort?: ColSort;
}) {
  const open = openPrefixes ?? new Set<string>();
  if (sort.by !== "grouped") {
    return (
      <>
        {sortedFlatColumns(columns, sort).map((col) => (
          <ColumnRow key={col.name} col={col} />
        ))}
      </>
    );
  }
  const sections = columnSections(columns);
  const blocks: ReactNode[] = [];

  if (sections.loose.length) {
    blocks.push(
      <div key="loose">
        {sections.loose.map((item) =>
          item.kind === "col" ? (
            <ColumnRow key={item.col.name} col={item.col} />
          ) : null,
        )}
      </div>,
    );
  }
  if (sections.prefix.length) {
    blocks.push(
      <div key="prefix">
        {sections.prefix.map((item) => (
          <GroupAccordion
            key={item.key}
            item={item}
            tableName={tableName}
            isOpen={open.has(item.key)}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </div>,
    );
  }
  if (sections.suffix.length) {
    blocks.push(
      <div key="suffix">
        {sections.suffix.map((item) => (
          <GroupAccordion
            key={item.key}
            item={item}
            tableName={tableName}
            isOpen={open.has(item.key)}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </div>,
    );
  }

  return blocks.flatMap((block, index) =>
    index === 0 ? [block] : [<ColumnSep key={`sep-${index}`} />, block],
  );
}

function undirectedNeighbors(name: string, fks: DbForeignKey[]) {
  const names = new Set<string>([name]);
  for (const fk of fks) {
    if (fk.fromTable === name) names.add(fk.toTable);
    if (fk.toTable === name) names.add(fk.fromTable);
  }
  return names;
}

/** Direct links plus tables that point at those. Parent-of-parent cards stay hidden. */
function focusNeighborhood(name: string, fks: DbForeignKey[]) {
  const direct = undirectedNeighbors(name, fks);
  const visible = new Set(direct);
  for (const table of direct) {
    for (const fk of fks) {
      if (fk.toTable === table) visible.add(fk.fromTable);
    }
  }
  return visible;
}

type CardinalityEnd =
  | "many"
  | "zero-or-many"
  | "one"
  | "one-only"
  | "zero-or-one";

type FkRelation = {
  key: string;
  label: string;
  optional: boolean;
  childEnd: CardinalityEnd;
  parentEnd: CardinalityEnd;
  columnLabel: string;
};

function columnsFor(table: DbTableInfo | undefined, names: string[]) {
  if (!table) return [];
  return names
    .map((name) => table.columns.find((col) => col.name === name))
    .filter((col): col is NonNullable<typeof col> => Boolean(col));
}

/** Crow's foot from SQL: unique → one, nullable → optional. */
function describeFk(
  fk: DbForeignKey,
  tablesByName: Map<string, DbTableInfo>,
  index: number,
): FkRelation {
  const fromCols = columnsFor(tablesByName.get(fk.fromTable), fk.fromColumns);
  const unique =
    fromCols.length > 0 &&
    fromCols.every((col) => col.unique || col.primaryKey);
  const mandatory = fromCols.length > 0 && fromCols.every((col) => col.notNull);
  const columnLabel =
    fk.fromColumns.length === 1 && fk.toColumns.length === 1
      ? `${fk.fromColumns[0]} → ${fk.toColumns[0]}`
      : `${fk.fromColumns.join(", ")} → ${fk.toColumns.join(", ")}`;

  if (unique && mandatory) {
    return {
      key: `${fk.fromTable}-${fk.toTable}-${columnLabel}-${index}`,
      label: "One and Only One (Mandatory)",
      optional: false,
      childEnd: "one-only",
      parentEnd: "one-only",
      columnLabel,
    };
  }
  if (unique && !mandatory) {
    return {
      key: `${fk.fromTable}-${fk.toTable}-${columnLabel}-${index}`,
      label: "Zero or one (Optional)",
      optional: true,
      childEnd: "zero-or-one",
      parentEnd: "zero-or-one",
      columnLabel,
    };
  }
  if (mandatory) {
    return {
      key: `${fk.fromTable}-${fk.toTable}-${columnLabel}-${index}`,
      label: "One to Many (Mandatory)",
      optional: false,
      childEnd: "many",
      parentEnd: "one-only",
      columnLabel,
    };
  }
  return {
    key: `${fk.fromTable}-${fk.toTable}-${columnLabel}-${index}`,
    label: "Zero or Many (Optional)",
    optional: true,
    childEnd: "zero-or-many",
    parentEnd: "zero-or-one",
    columnLabel,
  };
}

const START_MARKER: Record<CardinalityEnd, string> = {
  many: "url(#schema-fk-many)",
  "zero-or-many": "url(#schema-fk-zero-or-many)",
  one: "url(#schema-fk-one-start)",
  "one-only": "url(#schema-fk-one-only-start)",
  "zero-or-one": "url(#schema-fk-zero-or-one-start)",
};

const END_MARKER: Record<CardinalityEnd, string> = {
  many: "url(#schema-fk-many-end)",
  "zero-or-many": "url(#schema-fk-zero-or-many-end)",
  one: "url(#schema-fk-one)",
  "one-only": "url(#schema-fk-one-only)",
  "zero-or-one": "url(#schema-fk-zero-or-one)",
};

function RelationshipMarkers() {
  const stroke = { stroke: "currentColor", fill: "none" as const };
  return (
    <defs>
      <marker
        id="schema-fk-many"
        markerWidth="14"
        markerHeight="12"
        refX="1"
        refY="6"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path
          d="M13 1 L1 6 L13 11 M1 6 H13"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
      </marker>
      <marker
        id="schema-fk-zero-or-many"
        markerWidth="18"
        markerHeight="12"
        refX="1"
        refY="6"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path
          d="M17 1 L6 6 L17 11"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
        <circle cx="8.5" cy="6" r="3" strokeWidth="1.5" {...stroke} />
      </marker>
      <marker
        id="schema-fk-one-start"
        markerWidth="12"
        markerHeight="12"
        refX="1"
        refY="6"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <line x1="1" y1="6" x2="10" y2="6" strokeWidth="1.75" {...stroke} />
        <line x1="10" y1="2" x2="10" y2="10" strokeWidth="1.75" {...stroke} />
      </marker>
      <marker
        id="schema-fk-one-only-start"
        markerWidth="14"
        markerHeight="12"
        refX="1"
        refY="6"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <line x1="1" y1="6" x2="6" y2="6" strokeWidth="1.75" {...stroke} />
        <line x1="6" y1="1.5" x2="6" y2="10.5" strokeWidth="1.75" {...stroke} />
        <line
          x1="10"
          y1="1.5"
          x2="10"
          y2="10.5"
          strokeWidth="1.75"
          {...stroke}
        />
      </marker>
      <marker
        id="schema-fk-zero-or-one-start"
        markerWidth="16"
        markerHeight="12"
        refX="1"
        refY="6"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <line x1="1" y1="6" x2="6" y2="6" strokeWidth="1.5" {...stroke} />
        <circle cx="9" cy="6" r="3" strokeWidth="1.5" {...stroke} />
        <line
          x1="14"
          y1="1.5"
          x2="14"
          y2="10.5"
          strokeWidth="1.75"
          {...stroke}
        />
      </marker>
      <marker
        id="schema-fk-one"
        markerWidth="12"
        markerHeight="12"
        refX="11"
        refY="6"
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <line x1="2" y1="2" x2="2" y2="10" strokeWidth="1.75" {...stroke} />
        <line x1="2" y1="6" x2="11" y2="6" strokeWidth="1.75" {...stroke} />
      </marker>
      <marker
        id="schema-fk-one-only"
        markerWidth="14"
        markerHeight="12"
        refX="13"
        refY="6"
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <line x1="4" y1="1.5" x2="4" y2="10.5" strokeWidth="1.75" {...stroke} />
        <line x1="8" y1="1.5" x2="8" y2="10.5" strokeWidth="1.75" {...stroke} />
        <line x1="8" y1="6" x2="13" y2="6" strokeWidth="1.75" {...stroke} />
      </marker>
      <marker
        id="schema-fk-zero-or-one"
        markerWidth="16"
        markerHeight="12"
        refX="15"
        refY="6"
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <circle cx="5" cy="6" r="3" strokeWidth="1.5" {...stroke} />
        <line
          x1="10"
          y1="1.5"
          x2="10"
          y2="10.5"
          strokeWidth="1.75"
          {...stroke}
        />
        <line x1="10" y1="6" x2="15" y2="6" strokeWidth="1.5" {...stroke} />
      </marker>
      <marker
        id="schema-fk-many-end"
        markerWidth="14"
        markerHeight="12"
        refX="13"
        refY="6"
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <path
          d="M1 1 L13 6 L1 11 M1 6 H13"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
      </marker>
      <marker
        id="schema-fk-zero-or-many-end"
        markerWidth="18"
        markerHeight="12"
        refX="17"
        refY="6"
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <path
          d="M1 1 L12 6 L1 11"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
        <circle cx="9.5" cy="6" r="3" strokeWidth="1.5" {...stroke} />
      </marker>
    </defs>
  );
}

/** Child (many, crow's foot) → parent (one). Prefers child-left / parent-right. */
function edgeGeometry(
  child: Point & { height: number },
  parent: Point & { height: number },
) {
  const childCenterX = child.x + NODE_W / 2;
  const parentCenterX = parent.x + NODE_W / 2;
  const childOnLeft = childCenterX <= parentCenterX;

  const x1 = childOnLeft ? child.x + NODE_W : child.x;
  const y1 = child.y + child.height / 2;
  const x2 = childOnLeft ? parent.x : parent.x + NODE_W;
  const y2 = parent.y + parent.height / 2;
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.4);

  return {
    d: childOnLeft
      ? `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

type DragMode =
  | { kind: "pan"; startX: number; startY: number; camX: number; camY: number }
  | {
      kind: "node";
      name: string;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    };

export function SchemaDiagram({
  tables,
  foreignKeys,
  selected,
  onSelect,
}: {
  tables: DbTableInfo[];
  foreignKeys: DbForeignKey[];
  selected: string | null;
  onSelect: (table: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selected ? [selected] : []),
  );
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [openFk, setOpenFk] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [openColGroups, setOpenColGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [colSort, setColSort] = useState<Record<string, ColSort>>({});
  const browseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeMovedRef = useRef(false);
  const layoutIdRef = useRef<string | null>(null);

  cameraRef.current = camera;

  const tableKey = tables.map((t) => t.name).join("|");

  useEffect(() => {
    if (drag?.kind === "node") return;
    const seeds = seedLayout(tables, foreignKeys);
    const relayout = layoutIdRef.current !== LAYOUT_ID;
    layoutIdRef.current = LAYOUT_ID;
    const heights: Record<string, number> = {};
    for (const table of tables) {
      heights[table.name] = nodeHeight(
        table,
        expanded.has(table.name),
        openPrefixesFor(table.name, openColGroups),
        colSort[table.name] ?? GROUPED_SORT,
      );
    }
    setPositions((prev) => {
      const next = relayout ? {} : { ...prev };
      let changed = relayout;
      for (const seed of seeds) {
        if (!next[seed.name]) {
          next[seed.name] = { x: seed.x, y: seed.y };
          changed = true;
        }
      }
      for (const name of Object.keys(next)) {
        if (!tables.some((t) => t.name === name)) {
          delete next[name];
          changed = true;
        }
      }
      const packed = pushDownColumnOverlaps(next, heights, ROW_GAP);
      if (packed) return packed;
      return changed ? next : prev;
    });
  }, [
    tableKey,
    tables,
    foreignKeys,
    LAYOUT_ID,
    expanded,
    openColGroups,
    colSort,
    drag,
  ]);

  useEffect(() => {
    if (!selected) return;
    setExpanded((prev) => {
      if (prev.has(selected)) return prev;
      const next = new Set(prev);
      next.add(selected);
      return next;
    });
  }, [selected]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      setSpaceDown(true);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function onWheel(event: WheelEvent) {
      const target = event.target as HTMLElement | null;
      const colScroll = target?.closest("[data-schema-col-scroll]");
      if (colScroll) {
        const viewport = colScroll.querySelector(
          "[data-slot='scroll-area-viewport']",
        ) as HTMLElement | null;
        if (viewport && viewport.scrollHeight > viewport.clientHeight + 1) {
          return;
        }
      }

      event.preventDefault();
      const cam = cameraRef.current;
      const rect = el!.getBoundingClientRect();

      if (event.ctrlKey || event.metaKey) {
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const worldX = (mx - cam.x) / cam.zoom;
        const worldY = (my - cam.y) / cam.zoom;
        const nextZoom = clamp(
          cam.zoom * Math.exp(-event.deltaY * 0.01),
          MIN_ZOOM,
          MAX_ZOOM,
        );
        setCamera({
          zoom: nextZoom,
          x: mx - worldX * nextZoom,
          y: my - worldY * nextZoom,
        });
        return;
      }

      setCamera({
        ...cam,
        x: cam.x - event.deltaX,
        y: cam.y - event.deltaY,
      });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const nodes = useMemo(() => {
    return tables.map((table) => {
      const pos = positions[table.name] ?? { x: PAD, y: PAD };
      const isExpanded = expanded.has(table.name);
      return {
        table,
        x: pos.x,
        y: pos.y,
        height: nodeHeight(
          table,
          isExpanded,
          openPrefixesFor(table.name, openColGroups),
          colSort[table.name] ?? GROUPED_SORT,
        ),
        expanded: isExpanded,
      };
    });
  }, [tables, positions, expanded, openColGroups, colSort]);

  const nodeByName = useMemo(
    () => new Map(nodes.map((n) => [n.table.name, n])),
    [nodes],
  );
  const tablesByName = useMemo(
    () => new Map(tables.map((table) => [table.name, table])),
    [tables],
  );
  const visibleNames = useMemo(
    () => (focused ? focusNeighborhood(focused, foreignKeys) : null),
    [focused, foreignKeys],
  );

  const toggleExpanded = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleColGroup = useCallback((table: string, prefix: string) => {
    const key = groupKey(table, prefix);
    setOpenColGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const cycleColSort = useCallback((table: string, field: ColSortField) => {
    setColSort((prev) => ({
      ...prev,
      [table]: cycleColSortState(prev[table] ?? GROUPED_SORT, field),
    }));
  }, []);

  const handleSelect = useCallback(
    (name: string) => {
      onSelect(name);
      setExpanded((prev) => {
        if (prev.has(name)) return prev;
        const next = new Set(prev);
        next.add(name);
        return next;
      });
    },
    [onSelect],
  );

  const clearBrowseTimer = useCallback(() => {
    if (!browseTimerRef.current) return;
    clearTimeout(browseTimerRef.current);
    browseTimerRef.current = null;
  }, []);

  const queueBrowse = useCallback(
    (name: string) => {
      clearBrowseTimer();
      browseTimerRef.current = setTimeout(() => {
        browseTimerRef.current = null;
        handleSelect(name);
      }, 280);
    },
    [clearBrowseTimer, handleSelect],
  );

  const toggleFocus = useCallback(
    (name: string) => {
      clearBrowseTimer();
      setFocused((prev) => (prev === name ? null : name));
    },
    [clearBrowseTimer],
  );

  useEffect(() => () => clearBrowseTimer(), [clearBrowseTimer]);

  useEffect(() => {
    setOpenFk(null);
  }, [focused]);

  useEffect(() => {
    if (!drag) return;

    function onMove(event: PointerEvent) {
      if (drag!.kind === "pan") {
        setCamera((prev) => ({
          ...prev,
          x: drag!.camX + (event.clientX - drag!.startX),
          y: drag!.camY + (event.clientY - drag!.startY),
        }));
        return;
      }
      const cam = cameraRef.current;
      const dx = (event.clientX - drag!.startX) / cam.zoom;
      const dy = (event.clientY - drag!.startY) / cam.zoom;
      setPositions((prev) => ({
        ...prev,
        [drag!.name]: {
          x: drag!.originX + dx,
          y: drag!.originY + dy,
        },
      }));
      if (Math.abs(dx) + Math.abs(dy) > 6) nodeMovedRef.current = true;
    }

    function onUp() {
      setDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag]);

  function onBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const pan =
      event.button === 1 || spaceDown || event.target === event.currentTarget;
    if (!pan) return;
    setDrag({
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      camX: camera.x,
      camY: camera.y,
    });
  }

  function onNodePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    name: string,
  ) {
    if (spaceDown || event.button === 1) {
      event.preventDefault();
      setDrag({
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        camX: camera.x,
        camY: camera.y,
      });
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    nodeMovedRef.current = false;
    const pos = positions[name] ?? { x: PAD, y: PAD };
    setDrag({
      kind: "node",
      name,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
    });
  }

  function resetView() {
    const seeds = seedLayout(tables, foreignKeys);
    const next: Record<string, Point> = {};
    for (const seed of seeds) next[seed.name] = { x: seed.x, y: seed.y };
    const heights: Record<string, number> = {};
    for (const table of tables) {
      heights[table.name] = nodeHeight(
        table,
        expanded.has(table.name),
        openPrefixesFor(table.name, openColGroups),
        colSort[table.name] ?? GROUPED_SORT,
      );
    }
    setPositions(pushDownColumnOverlaps(next, heights, ROW_GAP) ?? next);
    setCamera({ x: 0, y: 0, zoom: 1 });
    setFocused(null);
  }

  const gridSize = 24 * camera.zoom;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          type="button"
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: clamp(c.zoom * 1.15, MIN_ZOOM, MAX_ZOOM),
            }))
          }
        >
          +
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: clamp(c.zoom / 1.15, MIN_ZOOM, MAX_ZOOM),
            }))
          }
        >
          −
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
          onClick={resetView}
        >
          Reset
        </button>
        {focused ? (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
            onClick={() => setFocused(null)}
          >
            Show all
          </button>
        ) : null}
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden",
          spaceDown || drag?.kind === "pan" ? "cursor-grab" : "cursor-default",
          drag?.kind === "pan" && "cursor-grabbing",
        )}
        onPointerDown={onBackdropPointerDown}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px),
              linear-gradient(to bottom, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)
            `,
            backgroundSize: `${gridSize}px ${gridSize}px`,
            backgroundPosition: `${camera.x % gridSize}px ${camera.y % gridSize}px`,
          }}
        />

        <div
          className="absolute top-0 left-0 origin-top-left will-change-transform"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <svg
            className="absolute overflow-visible"
            style={{
              left: -2000,
              top: -2000,
              width: 8000,
              height: 8000,
              pointerEvents: "none",
            }}
            viewBox="-2000 -2000 8000 8000"
            aria-label="Foreign key relationships"
          >
            <RelationshipMarkers />

            {foreignKeys.map((fk, index) => {
              const child = nodeByName.get(fk.fromTable);
              const parent = nodeByName.get(fk.toTable);
              if (!child || !parent || fk.fromTable === fk.toTable) return null;
              if (
                visibleNames &&
                (!visibleNames.has(fk.fromTable) ||
                  !visibleNames.has(fk.toTable))
              ) {
                return null;
              }
              const relation = describeFk(fk, tablesByName, index);
              const { d } = edgeGeometry(child, parent);
              const active = openFk === relation.key;
              return (
                <g
                  key={relation.key}
                  className={
                    active
                      ? "text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)]"
                  }
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    data-fk-edge={relation.key}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenFk((current) =>
                        current === relation.key ? null : relation.key,
                      );
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={active ? 1 : 0.75}
                    strokeWidth={active ? 2.25 : 1.75}
                    strokeDasharray={relation.optional ? "7 5" : undefined}
                    markerStart={START_MARKER[relation.childEnd]}
                    markerEnd={END_MARKER[relation.parentEnd]}
                  />
                </g>
              );
            })}
          </svg>

          <TooltipProvider delayDuration={150}>
            {foreignKeys.map((fk, index) => {
              const child = nodeByName.get(fk.fromTable);
              const parent = nodeByName.get(fk.toTable);
              if (!child || !parent || fk.fromTable === fk.toTable) return null;
              if (
                visibleNames &&
                (!visibleNames.has(fk.fromTable) ||
                  !visibleNames.has(fk.toTable))
              ) {
                return null;
              }
              const relation = describeFk(fk, tablesByName, index);
              const { midX, midY } = edgeGeometry(child, parent);
              return (
                <Popover
                  key={`fk-tip-${relation.key}`}
                  open={openFk === relation.key}
                  onOpenChange={(open) => {
                    setOpenFk((current) => {
                      if (open) return relation.key;
                      return current === relation.key ? null : current;
                    });
                  }}
                >
                  <PopoverAnchor asChild>
                    <span
                      className="pointer-events-none absolute z-20 size-0"
                      style={{ left: midX, top: midY }}
                    />
                  </PopoverAnchor>
                  <PopoverContent
                    side="top"
                    sideOffset={10}
                    className="w-fit max-w-xs bg-[var(--foreground)] p-2 font-sans text-xs leading-snug text-[var(--background)] shadow-md ring-0"
                    onPointerDownOutside={(event) => {
                      const target = event.target;
                      if (
                        target instanceof Element &&
                        target.closest(`[data-fk-edge="${relation.key}"]`)
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{relation.label}</span>
                      <span className="text-[10px] opacity-80">
                        {formatTableLabel(fk.fromTable)} →{" "}
                        {formatTableLabel(fk.toTable)}
                      </span>
                      <span className="font-mono text-[10px] opacity-70">
                        {relation.columnLabel}
                      </span>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}

            {nodes.map((node) => {
              if (visibleNames && !visibleNames.has(node.table.name))
                return null;
              const active = focused
                ? focused === node.table.name
                : selected === node.table.name;
              const fieldCount = node.table.columns.length;
              const openPrefixes = openPrefixesFor(
                node.table.name,
                openColGroups,
              );
              const sort = colSort[node.table.name] ?? GROUPED_SORT;
              const visibleRows = node.expanded
                ? sort.by === "grouped"
                  ? visibleRowCount(
                      groupColumns(node.table.columns),
                      openPrefixes,
                    )
                  : node.table.columns.length
                : 0;
              const columnList = (
                <div className="px-2 pt-1 pb-2">
                  <ColumnListHeader
                    sort={sort}
                    onCycleName={() => cycleColSort(node.table.name, "name")}
                    onCycleType={() => cycleColSort(node.table.name, "type")}
                    onCycleFlag={() => cycleColSort(node.table.name, "flag")}
                  />
                  <ColumnRows
                    tableName={node.table.name}
                    columns={node.table.columns}
                    openPrefixes={openPrefixes}
                    onToggleGroup={toggleColGroup}
                    sort={sort}
                  />
                </div>
              );
              return (
                <div
                  key={node.table.name}
                  className={cn(
                    "absolute z-10 flex select-none flex-col overflow-hidden rounded-[10px] border bg-[var(--background)] shadow-sm",
                    active
                      ? "border-2 border-[var(--foreground)]"
                      : "border-[var(--border)]",
                    drag?.kind === "node" && drag.name === node.table.name
                      ? "cursor-grabbing"
                      : "cursor-grab",
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_W,
                    height: node.height,
                  }}
                  onPointerDown={(event) =>
                    onNodePointerDown(event, node.table.name)
                  }
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (nodeMovedRef.current) return;
                    toggleFocus(node.table.name);
                  }}
                >
                  <div
                    className={cn(
                      "flex min-h-12 items-start gap-2 px-2.5 py-2",
                      node.expanded ? "rounded-t-[9px]" : "rounded-[9px]",
                      active
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "bg-[var(--muted)] text-[var(--foreground)]",
                    )}
                  >
                    <button
                      type="button"
                      title={node.table.name}
                      className="line-clamp-2 max-w-[9.5rem] cursor-pointer whitespace-normal break-words rounded px-0.5 text-left text-sm leading-tight font-semibold underline-offset-2 hover:underline"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        queueBrowse(node.table.name);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleFocus(node.table.name);
                      }}
                    >
                      {formatTableLabel(node.table.name)}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "ml-auto flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-md py-0.5 pr-1 pl-2.5 font-mono text-sm",
                        active
                          ? "bg-[var(--background)] text-[var(--foreground)]"
                          : "bg-[var(--background)] text-[var(--foreground)] ring-1 ring-[var(--border)] ring-inset",
                      )}
                      onPointerDown={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpanded(node.table.name);
                      }}
                      aria-label={
                        node.expanded
                          ? `Collapse ${node.table.name} columns`
                          : `Expand ${node.table.name} columns`
                      }
                      title={`${fieldCount} fields`}
                    >
                      <span>{fieldCount}</span>
                      <Icon
                        icon="ic:round-arrow-drop-down"
                        className={cn(
                          "size-6 shrink-0 transition-transform",
                          node.expanded && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>

                  {node.expanded ? (
                    visibleRows > MAX_VISIBLE_COLS ? (
                      <ScrollArea
                        type="always"
                        data-schema-col-scroll=""
                        className="min-h-0 flex-1 touch-pan-y overscroll-contain"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        {columnList}
                      </ScrollArea>
                    ) : (
                      columnList
                    )
                  ) : null}
                </div>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
