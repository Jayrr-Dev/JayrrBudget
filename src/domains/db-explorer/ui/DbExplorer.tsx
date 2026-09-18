"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tableHelp } from "@/domains/db-explorer/domain/columnHelp";
import {
  fetchDbSchema,
  fetchDbTable,
} from "@/domains/db-explorer/queries/dbExplorer";
import { dbExplorerQueryKeys } from "@/domains/db-explorer/queries/query-keys";
import { SchemaDiagram } from "@/domains/db-explorer/ui/SchemaDiagram";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const PAGE_SIZE = 50;

/** Plaintext money tables — empty / unused when private ledger is on. */
const PLAINTEXT_LEDGER_TABLES = new Set([
  "institutions",
  "accounts",
  "loan_terms",
  "loan_payment_links",
  "statement_uploads",
  "transactions",
  "merchants",
]);

function formatCell(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function TableBrowser({ table }: { table: string }) {
  const [offset, setOffset] = useState(0);
  const browse = useQuery({
    queryKey: dbExplorerQueryKeys.table(table, offset, PAGE_SIZE),
    queryFn: () => fetchDbTable(table, { limit: PAGE_SIZE, offset }),
  });

  const data = browse.data?.data;
  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
          {browse.isPending
            ? "Loading rows…"
            : `${pageStart}-${pageEnd} of ${total}`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset <= 0 || browse.isPending}
            onClick={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total || browse.isPending}
            onClick={() => setOffset((v) => v + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>

      {browse.isError ? (
        <div className="shrink-0 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {browse.error.message}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[var(--muted)]">
            <tr>
              {(data?.columns ?? []).map((col) => (
                <th
                  key={col}
                  className="border-b border-[var(--border)] px-3 py-2 font-mono font-medium whitespace-nowrap first:sticky first:left-0 first:z-20 first:bg-[var(--muted)]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="odd:bg-[var(--background)] even:bg-[var(--muted)]/20"
              >
                {(data?.columns ?? []).map((col) => (
                  <td
                    key={col}
                    className="max-w-[280px] truncate border-b border-[var(--border)] px-3 py-2 font-mono whitespace-nowrap first:sticky first:left-0 first:z-10 first:bg-[var(--background)]"
                    title={formatCell(row[col])}
                  >
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
            {!browse.isPending && (data?.rows.length ?? 0) === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(data?.columns.length ?? 1, 1)}
                  className="px-3 py-8 text-center text-[var(--muted-foreground)]"
                >
                  Empty table
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DbExplorer() {
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const schemaQuery = useQuery({
    queryKey: dbExplorerQueryKeys.schema,
    queryFn: fetchDbSchema,
  });
  const tables = schemaQuery.data?.schema.tables ?? [];
  const foreignKeys = schemaQuery.data?.schema.foreignKeys ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("schema");

  const visibleTables = useMemo(
    () =>
      encryptedLedger
        ? tables.filter((t) => !PLAINTEXT_LEDGER_TABLES.has(t.name))
        : tables,
    [encryptedLedger, tables],
  );

  const activeTable = selected ?? visibleTables[0]?.name ?? null;
  const activeMeta = useMemo(
    () => visibleTables.find((t) => t.name === activeTable) ?? null,
    [visibleTables, activeTable],
  );

  const visibleForeignKeys = useMemo(
    () =>
      encryptedLedger
        ? foreignKeys.filter(
            (fk) =>
              !PLAINTEXT_LEDGER_TABLES.has(fk.fromTable) &&
              !PLAINTEXT_LEDGER_TABLES.has(fk.toTable),
          )
        : foreignKeys,
    [encryptedLedger, foreignKeys],
  );
  const ledgerTables = useMemo(
    () => visibleTables.filter((t) => t.scope !== "auth"),
    [visibleTables],
  );
  const authTables = useMemo(
    () => visibleTables.filter((t) => t.scope === "auth"),
    [visibleTables],
  );

  function selectTable(name: string) {
    setSelected(name);
  }

  function openTable(name: string) {
    setSelected(name);
    setTab("browse");
  }

  if (schemaQuery.isPending) {
    return <PageSpinner />;
  }

  if (schemaQuery.isError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {schemaQuery.error.message}
      </div>
    );
  }

  function renderTableButton(table: (typeof tables)[number]) {
    return (
      <button
        key={table.name}
        type="button"
        onClick={() => selectTable(table.name)}
        className={cn(
          "flex min-h-11 w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          activeTable === table.name
            ? "bg-[var(--foreground)] text-[var(--background)]"
            : "hover:bg-[var(--muted)]",
        )}
      >
        <span className="min-w-0 line-clamp-2 break-words font-mono text-xs leading-snug">
          {table.name}
        </span>
        <Badge
          variant={activeTable === table.name ? "secondary" : "outline"}
          className="ml-2 shrink-0"
        >
          {table.rowCount}
        </Badge>
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="space-y-0.5">
          <h1 className="type-kicker text-[20px]">Database</h1>
          <p className="type-lead">
            {encryptedLedger
              ? "Private ledger is on — money rows live in encrypted vault records, not these plaintext tables."
              : "Browse tables and their rows. Click a table name to open it."}
          </p>
        </div>
        {activeMeta ? (
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-sm font-semibold">
              {activeMeta.name}
            </h2>
            <Badge variant="secondary">{activeMeta.rowCount} rows</Badge>
            <Badge variant="outline">{activeMeta.columns.length} columns</Badge>
            {activeMeta.scope === "auth" ? (
              <Badge variant="outline">auth</Badge>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="max-h-56 min-h-0 space-y-4 overflow-x-hidden lg:max-h-none overflow-y-auto lg:pr-1">
          <div className="space-y-1">
            <p className="mb-2 text-xs font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
              Ledger
            </p>
            {ledgerTables.map(renderTableButton)}
          </div>
          {authTables.length > 0 ? (
            <div className="space-y-1">
              <p className="mb-2 text-xs font-medium tracking-wide text-[var(--muted-foreground)] uppercase">
                Users / auth
              </p>
              {authTables.map(renderTableButton)}
            </div>
          ) : null}
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabsList className="shrink-0 self-start">
              <TabsTrigger value="schema">Schema</TabsTrigger>
              <TabsTrigger value="browse" disabled={!activeTable}>
                Browse
              </TabsTrigger>
              <TabsTrigger value="columns" disabled={!activeMeta}>
                Columns
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="schema"
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <SchemaDiagram
                tables={visibleTables}
                foreignKeys={visibleForeignKeys}
                selected={activeTable}
                onSelect={openTable}
              />
            </TabsContent>

            <TabsContent
              value="browse"
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              {activeTable ? (
                <TableBrowser key={activeTable} table={activeTable} />
              ) : null}
            </TabsContent>

            <TabsContent
              value="columns"
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              {activeMeta ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {tableHelp(activeMeta.name) ? (
                    <p className="mb-2 shrink-0 text-sm text-[var(--muted-foreground)]">
                      {tableHelp(activeMeta.name)}
                    </p>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)]">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Column</th>
                          <th className="px-3 py-2 font-medium">
                            What it is for
                          </th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMeta.columns.map((col) => (
                          <tr
                            key={col.name}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-3 py-2 align-top font-mono text-xs">
                              {col.name}
                            </td>
                            <td className="max-w-xl px-3 py-2 align-top text-sm leading-snug">
                              {col.description ?? "-"}
                            </td>
                            <td className="px-3 py-2 align-top font-mono text-xs text-[var(--muted-foreground)]">
                              {col.columnType || col.dataType}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-wrap gap-1">
                                {col.primaryKey ? (
                                  <Badge variant="secondary">PK</Badge>
                                ) : null}
                                {col.unique ? (
                                  <Badge variant="outline">unique</Badge>
                                ) : null}
                                {col.notNull ? (
                                  <Badge variant="outline">not null</Badge>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
