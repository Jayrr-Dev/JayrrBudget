"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";
import { flowMoneyProps, MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { MerchantLabel } from "@/domains/merchants/ui/MerchantLabel";
import { formatDisplayDate } from "@/shared/lib/format-date";
import { isValid, parseISO, subMonths, subWeeks } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

type RangeKey = "4w" | "3m" | "6m" | "12m";
type StatusKey = "all" | "pending" | "posted";
type SortKey = "date" | "label" | "amount" | "balance";
type SortDir = "asc" | "desc";

const RANGE_OPTIONS: { key: RangeKey; label: string; mobileLabel: string }[] = [
  { key: "4w", label: "Last 4 weeks", mobileLabel: "Last 4w" },
  { key: "3m", label: "Last 3 months", mobileLabel: "Last 3m" },
  { key: "6m", label: "Last 6 months", mobileLabel: "Last 6m" },
  { key: "12m", label: "Last 12 months", mobileLabel: "Last 12m" },
];

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "posted", label: "Posted" },
];

function parseTxnDate(value: string) {
  const date = parseISO(value.trim());
  return isValid(date) ? date : null;
}

function rangeStart(key: RangeKey, now: Date) {
  switch (key) {
    case "4w":
      return subWeeks(now, 4);
    case "3m":
      return subMonths(now, 3);
    case "6m":
      return subMonths(now, 6);
    case "12m":
      return subMonths(now, 12);
  }
}

function txnLabel(txn: DashboardTransaction) {
  const primary =
    txn.originalDescription?.trim() ||
    txn.merchantClean ||
    txn.merchantName ||
    txn.name;
  const bits = [primary];
  if (txn.transactionCode) bits.push(txn.transactionCode);
  if (txn.pending) bits.push("(Pending)");
  return bits.join(" ");
}

type Row = DashboardTransaction & { runningBalance: number | null };

function withRunningBalances(
  txns: DashboardTransaction[],
  currentBalance: number | null,
): Row[] {
  let running = currentBalance;
  return txns.map((txn) => {
    const row: Row = { ...txn, runningBalance: running };
    if (running != null) {
      running = running + txn.amount;
    }
    return row;
  });
}

function compareRows(a: Row, b: Row, sortKey: SortKey, sortDir: SortDir) {
  const dir = sortDir === "asc" ? 1 : -1;
  let cmp = 0;

  switch (sortKey) {
    case "date": {
      if (a.date === b.date) {
        cmp = a.transactionId.localeCompare(b.transactionId);
      } else {
        cmp = a.date < b.date ? -1 : 1;
      }
      break;
    }
    case "label":
      cmp = txnLabel(a).localeCompare(txnLabel(b), undefined, {
        sensitivity: "base",
      });
      break;
    case "amount":
      cmp = a.amount - b.amount;
      break;
    case "balance": {
      const av = a.runningBalance;
      const bv = b.runningBalance;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else cmp = av - bv;
      break;
    }
  }

  if (cmp !== 0) return cmp * dir;

  // Stable tie-break: newest date first, then id.
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.transactionId.localeCompare(a.transactionId);
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  align = "left",
  sticky = false,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  align?: "left" | "right";
  sticky?: boolean;
  onSort: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <TableHead
      data-sticky-col={sticky ? true : undefined}
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
      className={`px-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-1 font-medium transition-colors hover:bg-[var(--muted)] ${
          align === "right" ? "ml-auto" : ""
        }`}
      >
        {label}
        {active && sortDir === "asc" ? (
          <ArrowUpIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        ) : active && sortDir === "desc" ? (
          <ArrowDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        ) : (
          <ArrowUpDownIcon
            className="size-3.5 shrink-0 opacity-40"
            aria-hidden
          />
        )}
      </button>
    </TableHead>
  );
}

export function AccountPastTransactions({
  transactions,
  currentBalance,
  currency,
}: {
  transactions: DashboardTransaction[];
  currentBalance: number | null;
  currency: string;
}) {
  const [range, setRange] = useState<RangeKey>("4w");
  const [status, setStatus] = useState<StatusKey>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const chronological = [...transactions].sort((a, b) => {
      if (a.date === b.date) {
        return b.transactionId.localeCompare(a.transactionId);
      }
      return a.date < b.date ? 1 : -1;
    });
    const withBalances = withRunningBalances(chronological, currentBalance);

    const now = new Date();
    const start = rangeStart(range, now);
    const q = search.trim().toLowerCase();

    const filtered = withBalances.filter((txn) => {
      const date = parseTxnDate(txn.date);
      if (!date || date < start) return false;
      if (status === "pending" && !txn.pending) return false;
      if (status === "posted" && txn.pending) return false;
      if (!q) return true;
      const hay = [
        txn.name,
        txn.merchantName,
        txn.merchantClean,
        txn.originalDescription,
        txn.transactionCode,
        txn.sectionName,
        txn.categoryName,
        txn.subcategoryName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    return [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [transactions, currentBalance, range, status, search, sortKey, sortDir]);

  const rangeLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const end = fmt.format(new Date());
    const start = fmt.format(rangeStart(range, new Date()));
    return `${start} to ${end}`;
  }, [range]);

  function handleSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDir(column === "label" ? "asc" : "desc");
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Past transactions
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">{rangeLabel}</p>
      </div>

      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions"
              className="pl-8"
              aria-label="Search transactions"
            />
          </div>
          {search ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSearch("")}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
              Status
            </span>
            <ButtonGroup>
              {STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={status === option.key ? "default" : "outline"}
                  onClick={() => setStatus(option.key)}
                  aria-pressed={status === option.key}
                >
                  {option.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
              Range
            </span>
            <ButtonGroup>
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={range === option.key ? "default" : "outline"}
                  onClick={() => setRange(option.key)}
                  aria-pressed={range === option.key}
                  aria-label={option.label}
                >
                  <span className="sm:hidden">{option.mobileLabel}</span>
                  <span className="hidden sm:inline">{option.label}</span>
                </Button>
              ))}
            </ButtonGroup>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-surface-elevated">
        <Table className="min-w-[40rem] table-fixed">
          <colgroup>
            <col className="w-[11.5rem]" />
            <col />
            <col className="w-[9.75rem]" />
            <col className="w-[9.75rem]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
              <SortHeader
                label="Date"
                column="date"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Transactions"
                column="label"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Amount"
                column="amount"
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
                onSort={handleSort}
              />
              <SortHeader
                label="Running balance"
                column="balance"
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={4}
                  className="h-40 px-3 text-center text-[var(--muted-foreground)]"
                >
                  No transactions in this range.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((txn) => (
                <TableRow key={txn.transactionId}>
                  <TableCell className="px-3 py-2 font-mono text-xs tabular-nums">
                    {formatDisplayDate(txn.date)}
                  </TableCell>
                  <TableCell className="min-w-0 px-3 py-2">
                    <MerchantLabel
                      name={txnLabel(txn)}
                      src={txn.logoUrl}
                      lookupName={txn.merchantClean ?? txn.merchantName ?? null}
                      className="text-sm"
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <MoneyText
                      amount={txn.amount}
                      currency={currency}
                      {...flowMoneyProps(txn)}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <MoneyText
                      amount={txn.runningBalance}
                      currency={currency}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
