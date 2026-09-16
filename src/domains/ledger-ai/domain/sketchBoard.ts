import { tool, type InferUITool } from "ai";
import { z } from "zod";

export const SHOW_SKETCH_TOOL_NAME = "show_sketch";

export const MAX_SKETCH_COMMANDS = 40;
export const MAX_SKETCH_TEXT = 80;

const unit = z
  .number()
  .min(0)
  .max(100)
  .describe("Percent of the sketch, 0 to 100");

const color = z
  .string()
  .max(32)
  .optional()
  .describe("Hex like #e11d48, or a simple name like red/blue/green");

const label = z.string().max(MAX_SKETCH_TEXT).optional();

export const sketchCommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("clear") }),
  z.object({
    op: z.literal("rect"),
    x: unit,
    y: unit,
    w: unit,
    h: unit,
    fill: color,
    stroke: color,
    label,
  }),
  z.object({
    op: z.literal("circle"),
    x: unit,
    y: unit,
    r: unit.describe("Radius as percent of the shorter canvas side"),
    fill: color,
    stroke: color,
    label,
  }),
  z.object({
    op: z.literal("line"),
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
    stroke: color,
  }),
  z.object({
    op: z.literal("arrow"),
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
    stroke: color,
  }),
  z.object({
    op: z.literal("text"),
    x: unit,
    y: unit,
    text: z.string().min(1).max(MAX_SKETCH_TEXT),
    fill: color,
    size: z.number().min(8).max(28).optional(),
  }),
]);

export const showSketchInputSchema = z.object({
  title: z.string().min(1).max(80).describe("Short heading for the sketch dialog"),
  caption: z
    .string()
    .max(240)
    .optional()
    .describe("One sentence under the drawing"),
  commands: z
    .array(sketchCommandSchema)
    .min(1)
    .max(MAX_SKETCH_COMMANDS)
    .describe("Draw ops in order. Coords are 0-100 percent."),
});

export const showSketchOutputSchema = z.object({
  shown: z.boolean(),
  title: z.string(),
  commandCount: z.number(),
});

export type SketchCommand = z.infer<typeof sketchCommandSchema>;
export type ShowSketchInput = z.infer<typeof showSketchInputSchema>;
export type ShowSketchOutput = z.infer<typeof showSketchOutputSchema>;

const NAMED_COLORS: Record<string, string> = {
  red: "#b8245d",
  rose: "#b8245d",
  pink: "#b8245d",
  orange: "#9a5a05",
  amber: "#9a5a05",
  yellow: "#9a5a05",
  green: "#176a51",
  teal: "#176a51",
  cyan: "#176a51",
  blue: "#2563eb",
  indigo: "#176a51",
  violet: "#b8245d",
  purple: "#b8245d",
  slate: "#5d665f",
  gray: "#5d665f",
  grey: "#5d665f",
  black: "#17211c",
  white: "#fffdf8",
  accent: "#b8245d",
  primary: "#176a51",
  spend: "#b42318",
  income: "#177348",
};

function hexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const named = NAMED_COLORS[trimmed.toLowerCase()];
  if (named) return named;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return undefined;
}

function unitValue(value: unknown): number | undefined {
  let n = value;
  if (typeof n === "string") {
    const trimmed = n.trim().replace(/%$/, "");
    n = trimmed === "" ? Number.NaN : Number(trimmed);
  }
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  if (n < 0) return 0;
  if (n <= 1) return n * 100;
  if (n > 100) return 100;
  return n;
}

function asOp(raw: Record<string, unknown>): string | undefined {
  const value = raw.op ?? raw.type ?? raw.kind;
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

/** Best-effort parse so a streaming or slightly messy tool call still paints. */
export function normalizeSketchInput(input: unknown): ShowSketchInput | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const caption = typeof raw.caption === "string" ? raw.caption.trim() : undefined;
  let rows: unknown = raw.commands;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [];
    }
  }
  const list = Array.isArray(rows) ? rows : [];
  const commands: SketchCommand[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const op = asOp(item) === "bar" ? "rect" : asOp(item);
    if (op === "clear") {
      commands.push({ op: "clear" });
      continue;
    }
    if (op === "rect") {
      const x = unitValue(item.x);
      const y = unitValue(item.y);
      const w = unitValue(item.w ?? item.width);
      const h = unitValue(item.h ?? item.height);
      if (x == null || y == null || w == null || h == null) continue;
      commands.push({
        op: "rect",
        x,
        y,
        w,
        h,
        fill: hexColor(item.fill),
        stroke: hexColor(item.stroke),
        label: typeof item.label === "string" ? item.label : undefined,
      });
      continue;
    }
    if (op === "circle") {
      const x = unitValue(item.x);
      const y = unitValue(item.y);
      const r = unitValue(item.r ?? item.radius);
      if (x == null || y == null || r == null) continue;
      commands.push({
        op: "circle",
        x,
        y,
        r,
        fill: hexColor(item.fill),
        stroke: hexColor(item.stroke),
        label: typeof item.label === "string" ? item.label : undefined,
      });
      continue;
    }
    if (op === "line" || op === "arrow") {
      const x1 = unitValue(item.x1);
      const y1 = unitValue(item.y1);
      const x2 = unitValue(item.x2);
      const y2 = unitValue(item.y2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      commands.push({
        op,
        x1,
        y1,
        x2,
        y2,
        stroke: hexColor(item.stroke),
      });
      continue;
    }
    if (op === "text") {
      const x = unitValue(item.x);
      const y = unitValue(item.y);
      const text = typeof item.text === "string" ? item.text : "";
      if (x == null || y == null || !text) continue;
      const size = typeof item.size === "number" ? item.size : undefined;
      commands.push({
        op: "text",
        x,
        y,
        text,
        fill: hexColor(item.fill),
        size: size != null && size >= 8 && size <= 28 ? size : undefined,
      });
    }
  }
  if (!title && commands.length === 0) return null;
  return {
    title: title || "Sketch",
    caption,
    commands,
  };
}

export const showSketchTool = tool({
  description: [
    "Open a small HTML canvas sketch inline in chat (tap to enlarge).",
    "Use it to show a picture while you explain: a split of spend, a before/after, a flow of money, or a simple labeled diagram.",
    "Pass a command list (rect, circle, line, arrow, text). Do not send JavaScript.",
    "Keep it simple: 4 to 12 shapes, short labels, real numbers from their budget when you have them.",
    "Do not use this for a full Excalidraw board. Speak in chat as well; the sketch is a visual aid.",
  ].join(" "),
  inputSchema: showSketchInputSchema,
  outputSchema: showSketchOutputSchema,
  execute: async (input) => ({
    shown: true,
    title: input.title,
    commandCount: input.commands.length,
  }),
});

export type ShowSketchUITool = InferUITool<typeof showSketchTool>;
