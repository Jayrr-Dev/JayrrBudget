"use client";

import { Button } from "@/components/ui/button";
import type { ShowSketchInput } from "@/domains/ledger-ai/domain/sketchBoard";
import { showPiggySketch } from "@/domains/ledger-ai/ui/piggySketchStore";

export function PiggySketchChip({ input }: { input: ShowSketchInput }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <p className="min-w-0 truncate text-xs text-muted-foreground">
        Sketch: {input.title}
      </p>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-6 shrink-0 px-2 text-xs"
        onClick={() => showPiggySketch(input)}
      >
        Show
      </Button>
    </div>
  );
}
