"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SketchCommand } from "@/domains/ledger-ai/domain/sketchBoard";
import {
  paintSketchCommands,
  readSketchPaintTheme,
} from "@/domains/ledger-ai/ui/paintSketchCommands";
import {
  closePiggySketch,
  usePiggySketch,
} from "@/domains/ledger-ai/ui/piggySketchStore";
import { Info } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 320;

function paintCanvas(
  canvas: HTMLCanvasElement,
  commands: readonly SketchCommand[],
) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = CANVAS_WIDTH * ratio;
  canvas.height = CANVAS_HEIGHT * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  paintSketchCommands(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, commands, readSketchPaintTheme());
}

function SketchAboutInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
          aria-label="About Jev sketch"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} className="w-72 gap-0 p-3.5">
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Jev sketch</PopoverTitle>
          <PopoverDescription>
            A small whiteboard Jev can open to picture a money idea.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Shapes and labels from a command list, not freehand code</li>
            <li>Closes any time; chat keeps going</li>
            <li>Not the big Excalidraw canvas page</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export function PiggySketchDialog() {
  const sketch = usePiggySketch();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const attachCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      canvasRef.current = canvas;
      if (canvas && sketch.open) {
        paintCanvas(canvas, sketch.commands);
      }
    },
    [sketch.open, sketch.commands],
  );

  useEffect(() => {
    if (!sketch.open) return;
    const id = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (canvas) paintCanvas(canvas, sketch.commands);
    });
    return () => cancelAnimationFrame(id);
  }, [sketch.open, sketch.commands]);

  return (
    <Dialog
      open={sketch.open}
      onOpenChange={(open) => {
        if (!open) closePiggySketch();
      }}
    >
      <DialogContent
        className="z-[80] sm:max-w-xl"
        aria-describedby="piggy-sketch-sr"
      >
        <DialogHeader>
          <div className="flex items-center gap-1.5">
            <DialogTitle>{sketch.title || "Sketch"}</DialogTitle>
            <SketchAboutInfo />
          </div>
          <p id="piggy-sketch-sr" className="sr-only">
            Jev opened a sketch to explain something about your budget.
          </p>
        </DialogHeader>
        <canvas
          ref={attachCanvas}
          className="block w-full bg-transparent"
          style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        />
        {sketch.commands.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Jev sent a caption but no shapes. Ask it to sketch bars or boxes.
          </p>
        ) : null}
        {sketch.caption ? (
          <DialogDescription>{sketch.caption}</DialogDescription>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={closePiggySketch}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
