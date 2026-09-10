"use client";

import { format, isValid, parseISO, subMonths, subWeeks } from "date-fns";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/domains/dashboard/domain/money";
import type { DashboardTransaction } from "@/domains/dashboard/domain/types";

type RangeKey = "4w" | "3m" | "6m" | "12m";
type StatusKey = "all" | "pending" | "posted";
type SortKey = "date" | "label" | "debit" | "credit" | "balance";
type SortDir = "asc" | "desc";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "4w", label: "Last 4 weeks" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "12m", label: "Last 12 months" },
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

function formatTxnDate(value: string) {
  const date = parseTxnDate(value);
  if (!date) return value;
  return format(date, "MMM d, yyyy");
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
    case "debit": {
      const av = a.amount > 0 ? a.amount : null;
      const bv = b.amount > 0 ? b.amount : null;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else cmp = av - bv;
      break;
    }
    case "credit": {
      const av = a.amount < 0 ? Math.abs(a.amount) : null;
      const bv = b.amount < 0 ? Math.abs(b.amount) : null;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else cmp = av - bv;
      break;
    }
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
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  align?: "left" | "right";
  onSort: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th
      className={`overflow-hidden py-3 font-semibold ${align === "right" ? "pl-3 text-right" : "pr-3 text-left"}`}
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSort(column)}
        className={`h-7 max-w-full gap-1 px-1.5 uppercase tracking-wide ${
          active ? "text-[#1a2330]" : "text-[#4b5563]"
        } ${align === "right" ? "ml-auto pr-0" : "-ml-1.5"}`}
      >
        {label}
        <span
          className={`text-[#7a1f2b] ${active ? "opacity-100" : "opacity-30"}`}
          aria-hidden
        >
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Button>
    </th>
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
        txn.categoryDetailed,
        txn.categoryPrimary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    return [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [transactions, currentBalance, range, status, search, sortKey, sortDir]);

  const rangeLabel = useMemo(() => {
    const end = format(new Date(), "MMMM d, yyyy");
    const start = format(rangeStart(range, new Date()), "MMMM d, yyyy");
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-wide text-[#1a2330] uppercase sm:text-2xl">
          Past transactions
          <span className="mt-1 block text-sm font-normal tracking-normal text-[#6b7280] normal-case sm:mt-0 sm:ml-2 sm:inline">
            ({rangeLabel})
          </span>
        </h2>
      </div>

      <div className="flex flex-col gap-3 border-b border-[#d8dee6] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#6b7280]" />
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-[#6b7280] uppercase">
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
            <span className="text-xs font-medium tracking-wide text-[#6b7280] uppercase">
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
                >
                  {option.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[7.5rem]" />
            <col />
            <col className="w-[6.75rem]" />
            <col className="w-[6.75rem]" />
            <col className="w-[9.75rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#1a2330] text-xs">
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
                label="Debit"
                column="debit"
                sortKey={sortKey}
                sortDir={sortDir}
                align="right"
                onSort={handleSort}
              />
              <SortHeader
                label="Credit"
                column="credit"
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[#6b7280]">
                  No transactions in this range.
                </td>
              </tr>
            ) : (
              rows.map((txn) => {
                const isDebit = txn.amount > 0;
                const isCredit = txn.amount < 0;
                return (
                  <tr
                    key={txn.transactionId}
                    className="border-b border-[#e5e9ef]"
                  >
                    <td className="whitespace-nowrap py-3.5 pr-3 text-[#1a2330]">
                      {formatTxnDate(txn.date)}
                    </td>
                    <td className="min-w-0 py-3.5 pr-3 text-[#1a2330]">
                      <span className="line-clamp-2 break-words">
                        {txnLabel(txn)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3.5 pr-3 text-right font-mono text-[#1a2330]">
                      {isDebit ? formatMoney(txn.amount, currency) : ""}
                    </td>
                    <td className="whitespace-nowrap py-3.5 pr-3 text-right font-mono text-[#1a2330]">
                      {isCredit
                        ? formatMoney(Math.abs(txn.amount), currency)
                        : ""}
                    </td>
                    <td className="whitespace-nowrap py-3.5 text-right font-mono text-[#1a2330]">
                      {formatMoney(txn.runningBalance, currency)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}
