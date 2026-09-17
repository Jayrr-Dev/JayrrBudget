"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PageSpinner } from "@/components/ui/spinner";
import dynamic from "next/dynamic";

const BudgetCanvas = dynamic(
  () =>
    import("@/domains/canvas/ui/BudgetCanvas").then((mod) => mod.BudgetCanvas),
  {
    ssr: false,
    loading: () => <PageSpinner className="h-full min-h-64 py-8" />,
  },
);

export default function CanvasPage() {
  return (
    <AppShell
      className="h-full min-h-0 overflow-hidden"
      contentClassName="flex max-w-none min-h-0 flex-col overflow-hidden p-4 sm:p-4"
    >
      <BudgetCanvas />
    </AppShell>
  );
}
