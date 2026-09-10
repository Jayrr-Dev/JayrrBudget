"use client";

import dynamic from "next/dynamic";
import { AppShell } from "@/components/layout/AppShell";

const BudgetCanvas = dynamic(
  () =>
    import("@/domains/canvas/ui/BudgetCanvas").then((mod) => mod.BudgetCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        Loading canvas…
      </div>
    ),
  },
);

export default function CanvasPage() {
  return (
    <AppShell
      className="h-screen min-h-0 overflow-hidden"
      contentClassName="flex max-w-none min-h-0 flex-col overflow-hidden p-4 sm:p-4"
    >
      <BudgetCanvas />
    </AppShell>
  );
}
