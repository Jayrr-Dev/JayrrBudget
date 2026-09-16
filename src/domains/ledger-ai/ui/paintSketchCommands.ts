import type { SketchCommand } from "@/domains/ledger-ai/domain/sketchBoard";

export type SketchPaintTheme = {
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  fills: readonly string[];
  strokes: readonly string[];
};

function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export function readSketchPaintTheme(): SketchPaintTheme {
  return {
    surface: cssVar("--popover", "#fffdf8"),
    ink: cssVar("--foreground", "#17211c"),
    muted: cssVar("--foreground-muted", "#5d665f"),
    accent: cssVar("--accent", "#b8245d"),
    fills: [
      cssVar("--accent-subtle", "#fde2ec"),
      cssVar("--primary-subtle", "#d8eee4"),
      cssVar("--warning-subtle", "#fff4d6"),
      cssVar("--info-subtle", "#eaf1ff"),
    ],
    strokes: [
      cssVar("--accent", "#b8245d"),
      cssVar("--primary", "#176a51"),
      cssVar("--warning", "#9a5a05"),
      cssVar("--info", "#2563eb"),
    ],
  };
}

function px(n: number, size: number) {
  return (n / 100) * size;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 9;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - size * Math.cos(angle - Math.PI / 6),
    y2 - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - size * Math.cos(angle + Math.PI / 6),
    y2 - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function paintLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  ink: string,
) {
  ctx.fillStyle = ink;
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

export function paintSketchCommands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  commands: readonly SketchCommand[],
  theme: SketchPaintTheme = readSketchPaintTheme(),
) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1.75;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let shape = 0;
  for (const command of commands) {
    if (command.op === "clear") {
      ctx.clearRect(0, 0, width, height);
      continue;
    }

    const fill = command.fill ?? theme.fills[shape % theme.fills.length] ?? theme.fills[0]!;
    const stroke = command.stroke ?? theme.strokes[shape % theme.strokes.length] ?? theme.ink;
    shape += 1;

    if (command.op === "rect") {
      const x = px(command.x, width);
      const y = px(command.y, height);
      const w = px(command.w, width);
      const h = px(command.h, height);
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      if (command.label) paintLabel(ctx, command.label, x + w / 2, y + h / 2, theme.ink);
      continue;
    }

    if (command.op === "circle") {
      const x = px(command.x, width);
      const y = px(command.y, height);
      const r = px(command.r, Math.min(width, height));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      if (command.label) paintLabel(ctx, command.label, x, y, theme.ink);
      continue;
    }

    if (command.op === "line" || command.op === "arrow") {
      const x1 = px(command.x1, width);
      const y1 = px(command.y1, height);
      const x2 = px(command.x2, width);
      const y2 = px(command.y2, height);
      ctx.strokeStyle = command.stroke ?? theme.accent;
      ctx.fillStyle = command.stroke ?? theme.accent;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (command.op === "arrow") drawArrowHead(ctx, x1, y1, x2, y2);
      continue;
    }

    ctx.fillStyle = command.fill ?? theme.ink;
    ctx.font = `${command.size ?? 14}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(command.text, px(command.x, width), px(command.y, height));
  }
}
