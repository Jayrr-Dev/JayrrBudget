"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { useQuery } from "convex/react";
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
  }),
  columnHelper.accessor("name", {
    header: "Module",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.name}</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {row.original.description}
        </p>
      </div>
    ),
    filterFn: "includesString",
  }),
  columnHelper.accessor("category", {
    header: "Category",
    cell: ({ getValue }) => (
      <Badge variant="secondary">{String(getValue())}</Badge>
    ),
  }),
  columnHelper.accessor("href", {
    header: "Route",
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{String(getValue())}</span>
    ),
  }),
  columnHelper.display({
    id: "enabled",
    header: "Enabled",
    cell: ({ row }) => <ModuleEnabledSwitch module={row.original} />,
  }),
]);

export function ModuleManager() {
  const modules = useQuery(api.modules.list, {});

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
