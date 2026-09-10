"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import { Switch } from "@/components/ui/switch";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import {
  fetchModules,
  updateModuleEnabled,
} from "@/domains/modules/queries/modules";
import { moduleQueryKeys } from "@/domains/modules/queries/query-keys";
import { resolveModuleIcon } from "@/domains/modules/ui/moduleIcons";

const columnHelper = createColumnHelper<DataTableFeatures, AppModuleRecord>();

function ModuleEnabledSwitch({ module }: { module: AppModuleRecord }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      updateModuleEnabled(module.slug, enabled),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: moduleQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: moduleQueryKeys.enabled }),
      ]);
    },
  });

  return (
    <Switch
      size="lg"
      checked={module.enabled}
      disabled={module.isCore || toggle.isPending}
      onCheckedChange={(checked) => toggle.mutate(Boolean(checked))}
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
  const modules = useQuery({
    queryKey: moduleQueryKeys.all,
    queryFn: () => fetchModules(),
  });

  if (modules.isPending) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Loading modules…</p>
    );
  }

  if (modules.isError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {modules.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Module manager</h1>
        <p className="text-[var(--muted-foreground)]">
          Toggle product modules. Core modules stay on. Sidebar follows enabled
          modules.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={modules.data.modules}
        searchKey="name"
        searchPlaceholder="Filter modules…"
        pageSize={20}
      />
    </div>
  );
}
