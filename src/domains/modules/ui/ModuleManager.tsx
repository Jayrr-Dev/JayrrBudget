"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { Switch } from "@/components/ui/switch";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import { resolveModuleIcon } from "@/domains/modules/ui/moduleIcons";

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
  columnHelper.display({
    id: "icon",
    header: "",
    cell: ({ row }) => {
      const Icon = resolveModuleIcon(row.original.icon);
      return <Icon className="size-5 text-[var(--muted-foreground)]" />;
    },
    meta: { label: "Icon", width: "2.5rem", nowrap: true },
  }),
  columnHelper.accessor("name", {
    header: "Module",
    cell: ({ row }) => (
      <span
        className="block truncate font-medium"
        title={`${row.original.name} — ${row.original.description}`}
      >
        {row.original.name}
      </span>
    ),
    filterFn: "includesString",
    meta: { width: "14rem", nowrap: true, grow: true },
  }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: ({ getValue }) => (
      <span
        className="block truncate text-sm text-[var(--muted-foreground)]"
        title={String(getValue())}
      >
        {String(getValue())}
      </span>
    ),
    filterFn: "includesString",
    meta: { width: "22rem", nowrap: true, grow: true },
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
      <span className="block truncate font-mono text-xs" title={String(getValue())}>
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
    />
  );
}
