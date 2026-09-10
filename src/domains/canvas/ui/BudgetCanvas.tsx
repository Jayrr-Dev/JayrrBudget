"use client";

import { Tldraw, type TLComponents } from "tldraw";
import "tldraw/tldraw.css";
import { CanvasQuickActions } from "@/domains/canvas/ui/CanvasAiChat";

const components: TLComponents = {
  QuickActions: CanvasQuickActions,
};

export function BudgetCanvas() {
  return (
    <div className="h-full min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <Tldraw persistenceKey="jayrr-budget-canvas" components={components} />
    </div>
  );
}
