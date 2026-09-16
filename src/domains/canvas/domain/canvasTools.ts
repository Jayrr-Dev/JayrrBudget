import { tool } from "ai";
import { z } from "zod";

const colorSchema = z
  .string()
  .describe(
    'Palette name (black, grey, red, blue, green-light, blue-tint, ...) or hex like "#a5d8ff", or "transparent".',
  );

export const canvasFontNames = ["hand", "heading", "code", "clean"] as const;
export type CanvasFontName = (typeof canvasFontNames)[number];

const fontSchema = z
  .enum(canvasFontNames)
  .describe(
    "hand = Excalifont (default body), heading = Lilita One (titles/section headers), code = Comic Shanns (numbers, ids, technical), clean = Nunito (professional).",
  );

const textAlignSchema = z.enum(["left", "center", "right"]);
const verticalAlignSchema = z.enum(["top", "middle", "bottom"]);

const arrowheadSchema = z.enum([
  "none",
  "arrow",
  "triangle",
  "triangle_outline",
  "bar",
  "dot",
  "circle",
  "circle_outline",
  "diamond",
  "diamond_outline",
]);

/** Visual style fields shared by every drawable element. */
const styleFields = {
  stroke: colorSchema.optional().describe("Outline color. Default black."),
  fill: colorSchema
    .optional()
    .describe("Background color. Default transparent. Use *-light / *-tint names for readable pastel fills."),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch", "zigzag"]).optional(),
  strokeWidth: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  roughness: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .optional()
    .describe("0 = clean architect lines, 1 = default sketchy, 2 = very rough."),
  opacity: z.number().min(0).max(100).optional(),
  group: z
    .string()
    .optional()
    .describe("Elements sharing the same group key get grouped so they move together."),
};

const refField = z
  .string()
  .optional()
  .describe(
    "Temporary id unique within this call. Arrows use it in from/to; frames use it in children.",
  );

const labelFields = {
  text: z.string().optional().describe("Label text. Use \\n for line breaks."),
  fontSize: z.number().optional().describe("Default 20. Headings 28-36."),
  font: fontSchema.optional(),
  textColor: colorSchema.optional().describe("Label color. Default black."),
  textAlign: textAlignSchema.optional(),
  verticalAlign: verticalAlignSchema.optional(),
};

const containerSchema = z.object({
  type: z.enum(["rectangle", "ellipse", "diamond"]),
  ref: refField,
  x: z.number(),
  y: z.number(),
  w: z.number().describe("Width. Labeled boxes: at least 160."),
  h: z.number().describe("Height. Labeled boxes: at least 60. Grows to fit text."),
  rounded: z.boolean().optional().describe("Rounded corners (rectangles). Default true."),
  ...labelFields,
  ...styleFields,
});

const textSchema = z.object({
  type: z.literal("text"),
  ref: refField,
  x: z.number(),
  y: z.number(),
  text: z.string().describe("Use \\n for line breaks. Size is measured automatically."),
  fontSize: z.number().optional().describe("Default 20. Titles 32-40, captions 14-16."),
  font: fontSchema.optional(),
  color: colorSchema.optional().describe("Text color. Default black."),
  textAlign: textAlignSchema.optional(),
  group: styleFields.group,
  opacity: styleFields.opacity,
});

const noteSchema = z.object({
  type: z.literal("note"),
  ref: refField,
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),
  h: z.number().optional(),
  text: z.string(),
  fontSize: z.number().optional(),
  fill: colorSchema.optional().describe("Sticky color. Default yellow-light."),
  group: styleFields.group,
});

const pointSchema = z.tuple([z.number(), z.number()]);

const arrowSchema = z.object({
  type: z.literal("arrow"),
  ref: refField,
  from: z
    .string()
    .optional()
    .describe("ref (this call) or existing element id the arrow starts at. Anchor point is computed for you."),
  to: z
    .string()
    .optional()
    .describe("ref (this call) or existing element id the arrow points to. Anchor point is computed for you."),
  route: z
    .enum(["straight", "elbow", "curved"])
    .optional()
    .describe("elbow = orthogonal segments (default for flows), straight, or curved."),
  x: z.number().optional().describe("Only when from/to are omitted."),
  y: z.number().optional().describe("Only when from/to are omitted."),
  points: z
    .array(pointSchema)
    .min(2)
    .optional()
    .describe("Only when from/to are omitted. Relative to x,y; first point is [0,0]."),
  startArrowhead: arrowheadSchema.optional().describe("Default none."),
  endArrowhead: arrowheadSchema.optional().describe("Default arrow."),
  label: z.string().optional().describe("Short text on the arrow (under 20 chars)."),
  labelFontSize: z.number().optional(),
  stroke: styleFields.stroke,
  strokeWidth: styleFields.strokeWidth,
  strokeStyle: styleFields.strokeStyle,
  roughness: styleFields.roughness,
  opacity: styleFields.opacity,
  group: styleFields.group,
});

const lineSchema = z.object({
  type: z.literal("line"),
  ref: refField,
  x: z.number(),
  y: z.number(),
  points: z
    .array(pointSchema)
    .min(2)
    .describe("Relative to x,y; first point is [0,0]. Use for axes, dividers, timelines, chart lines."),
  stroke: styleFields.stroke,
  strokeWidth: styleFields.strokeWidth,
  strokeStyle: styleFields.strokeStyle,
  roughness: styleFields.roughness,
  opacity: styleFields.opacity,
  group: styleFields.group,
});

const frameSchema = z.object({
  type: z.literal("frame"),
  ref: refField,
  name: z.string().describe("Frame title shown above the frame."),
  children: z
    .array(z.string())
    .min(1)
    .describe("refs (this call) or existing ids. Frame bounds are computed from children plus padding."),
  padding: z.number().optional().describe("Padding around children. Default 24."),
});

const createElementSchema = z.discriminatedUnion("type", [
  containerSchema,
  textSchema,
  noteSchema,
  arrowSchema,
  lineSchema,
  frameSchema,
]);

const updateElementSchema = z.object({
  id: z.string().describe("Existing element id from the canvas snapshot."),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  text: z.string().optional().describe("New label / text."),
  fontSize: z.number().optional(),
  stroke: styleFields.stroke,
  fill: styleFields.fill,
  fillStyle: styleFields.fillStyle,
  strokeWidth: styleFields.strokeWidth,
  strokeStyle: styleFields.strokeStyle,
  roughness: styleFields.roughness,
  opacity: styleFields.opacity,
});

/** Client-executed canvas tools (no server execute). */
export const canvasClientTools = {
  create_shapes: tool({
    description:
      "Draw elements on the Excalidraw board: rectangle/ellipse/diamond containers with labels, standalone text, sticky notes, arrows bound to shapes (from/to), lines (axes, dividers, timelines), and frames that group children under a title. Put shapes BEFORE the arrows and frames that reference them.",
    inputSchema: z.object({
      elements: z.array(createElementSchema).min(1).max(120),
    }),
  }),
  update_shapes: tool({
    description:
      "Move, resize, restyle, or relabel existing elements by id. Bound arrows follow moved shapes.",
    inputSchema: z.object({
      elements: z.array(updateElementSchema).min(1).max(80),
    }),
  }),
  delete_shapes: tool({
    description: "Delete elements by id from the board.",
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).max(120),
    }),
  }),
  clear_page: tool({
    description: "Delete every element on the board. Use only when asked.",
    inputSchema: z.object({
      confirm: z.literal(true),
    }),
  }),
};

export type CanvasClientTools = typeof canvasClientTools;
export type CreateElementInput = z.infer<typeof createElementSchema>;
export type UpdateElementInput = z.infer<typeof updateElementSchema>;
export type CanvasContainerInput = z.infer<typeof containerSchema>;
export type CanvasTextInput = z.infer<typeof textSchema>;
export type CanvasNoteInput = z.infer<typeof noteSchema>;
export type CanvasArrowInput = z.infer<typeof arrowSchema>;
export type CanvasLineInput = z.infer<typeof lineSchema>;
export type CanvasFrameInput = z.infer<typeof frameSchema>;
