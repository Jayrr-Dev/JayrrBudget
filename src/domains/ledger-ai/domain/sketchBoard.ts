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
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .optional()
  .describe("Hex color such as #e11d48");

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

export const showSketchTool = tool({
  description: [
    "Open a small HTML canvas sketch dialog for the user.",
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
