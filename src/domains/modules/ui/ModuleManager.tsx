"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { Switch } from "@/components/ui/switch";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import { resolveModuleIcon } from "@/domains/modules/ui/moduleIcons";
import { api } from "@convex/_generated/api";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";

const columnHelper = createColumnHelper<DataTableFeatures, AppModuleRecord>();

function ModuleEnabledSwitch({ module }: { module: AppModuleRecord }) {
  const setEnabled = useMutation(api.modules.setEnabled);

  return (
    <Switch
      size="lg"
      checked={module.enabled}
      disabled={module.isCore}
      onCheckedChange={(checked) =>
        void setEnabled({ slug: module.slug, enabled: Boolean(checked) })
      }
    />
  );
}

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Module",
    cell: ({ row }) => {
      const Icon = resolveModuleIcon(row.original.icon);
      const description = row.original.description ?? "";
      return (
        <div
          className="flex min-w-0 items-start gap-3"
          title={
            description
              ? `${row.original.name} — ${description}`
              : row.original.name
          }
        >
          <Icon className="mt-0.5 size-5 shrink-0 text-[var(--muted-foreground)]" />
          <span className="min-w-0">
            <span className="block font-medium">{row.original.name}</span>
            {description ? (
              <span className="mt-0.5 block text-sm text-[var(--muted-foreground)]">
                {description}
              </span>
            ) : null}
          </span>
        </div>
      );
    },
    filterFn: (row, _columnId, value) => {
      const query = String(value ?? "")
        .trim()
        .toLowerCase();
      if (!query) return true;
      const name = row.original.name.toLowerCase();
      const description = (row.original.description ?? "").toLowerCase();
      return name.includes(query) || description.includes(query);
    },
    meta: { width: "22rem", wrap: true, grow: true },
  }),
  columnHelper.accessor("category", {
    header: "Category",
    cell: ({ getValue }) => (
      <Badge variant="secondary">{String(getValue())}</Badge>
    ),
    meta: { width: "8rem", nowrap: true },
  }),
  columnHelper.accessor("href", {
    header: "Route",
    cell: ({ getValue }) => (
      <span
        className="block truncate font-mono text-xs"
        title={String(getValue())}
      >
        {String(getValue())}
      </span>
    ),
    meta: { width: "10rem", nowrap: true },
  }),
  columnHelper.display({
    id: "enabled",
    header: "Enabled",
    cell: ({ row }) => <ModuleEnabledSwitch module={row.original} />,
    meta: { label: "Enabled", width: "6rem", nowrap: true },
  }),
]);

export function ModuleManager() {
  const ensure = useMutation(api.modules.ensure);
  const modules = useQuery(api.modules.list, {});

  useEffect(() => {
    void ensure({});
  }, [ensure]);

  if (modules === undefined) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Loading modules…</p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={modules}
      searchKey="name"
      searchPlaceholder="Filter modules…"
      pageSize={50}
    />
  );
}
