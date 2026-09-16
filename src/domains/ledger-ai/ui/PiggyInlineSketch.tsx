"use client";

import type { ShowSketchInput } from "@/domains/ledger-ai/domain/sketchBoard";
import { normalizeSketchInput } from "@/domains/ledger-ai/domain/sketchBoard";
import {
  paintSketchCommands,
  readSketchPaintTheme,
} from "@/domains/ledger-ai/ui/paintSketchCommands";
import { showPiggySketch } from "@/domains/ledger-ai/ui/piggySketchStore";
import { useEffect, useRef } from "react";

const WIDTH = 420;
const HEIGHT = 160;

export function PiggyInlineSketch({ input }: { input: ShowSketchInput }) {
  const sketch = normalizeSketchInput(input) ?? input;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintSketchCommands(ctx, WIDTH, HEIGHT, sketch.commands, readSketchPaintTheme());
  }, [sketch.commands]);

  return (
    <button
      type="button"
      className="mt-1.5 w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => showPiggySketch(sketch)}
      aria-label={`Open sketch: ${sketch.title}`}
    >
      {sketch.title ? (
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          {sketch.title}
        </p>
      ) : null}
      <canvas
        ref={canvasRef}
        className="block w-full bg-transparent"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        width={WIDTH}
        height={HEIGHT}
      />
    </button>
  );
}
