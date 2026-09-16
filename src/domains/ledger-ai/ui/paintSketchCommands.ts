import type { SketchCommand } from "@/domains/ledger-ai/domain/sketchBoard";

const DEFAULT_STROKE = "#334155";
const DEFAULT_TEXT = "#0f172a";

function px(n: number, size: number) {
  return (n / 100) * size;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;
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
) {
  ctx.fillStyle = DEFAULT_TEXT;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

export function paintSketchCommands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  commands: readonly SketchCommand[],
) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const command of commands) {
    if (command.op === "clear") {
      ctx.clearRect(0, 0, width, height);
      continue;
    }

    if (command.op === "rect") {
      const x = px(command.x, width);
      const y = px(command.y, height);
      const w = px(command.w, width);
      const h = px(command.h, height);
      if (command.fill) {
        ctx.fillStyle = command.fill;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = command.stroke ?? DEFAULT_STROKE;
      ctx.strokeRect(x, y, w, h);
      if (command.label) paintLabel(ctx, command.label, x + w / 2, y + h / 2);
      continue;
    }

    if (command.op === "circle") {
      const x = px(command.x, width);
      const y = px(command.y, height);
      const r = px(command.r, Math.min(width, height));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (command.fill) {
        ctx.fillStyle = command.fill;
        ctx.fill();
      }
      ctx.strokeStyle = command.stroke ?? DEFAULT_STROKE;
      ctx.stroke();
      if (command.label) paintLabel(ctx, command.label, x, y);
      continue;
    }

    if (command.op === "line" || command.op === "arrow") {
      const x1 = px(command.x1, width);
      const y1 = px(command.y1, height);
      const x2 = px(command.x2, width);
      const y2 = px(command.y2, height);
      ctx.strokeStyle = command.stroke ?? DEFAULT_STROKE;
      ctx.fillStyle = command.stroke ?? DEFAULT_STROKE;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (command.op === "arrow") drawArrowHead(ctx, x1, y1, x2, y2);
      continue;
    }

    ctx.fillStyle = command.fill ?? DEFAULT_TEXT;
    ctx.font = `${command.size ?? 14}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(command.text, px(command.x, width), px(command.y, height));
  }
}
