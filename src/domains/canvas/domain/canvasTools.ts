import { tool } from "ai";
import { z } from "zod";

const colorSchema = z
  .enum([
    "black",
    "grey",
    "light-violet",
    "violet",
    "blue",
    "light-blue",
    "yellow",
    "orange",
    "green",
    "light-green",
    "light-red",
    "red",
    "white",
  ])
  .optional();

const geoTypeSchema = z.enum([
  "rectangle",
  "ellipse",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "octagon",
  "star",
  "rhombus",
  "oval",
  "trapezoid",
  "arrow-right",
  "arrow-left",
  "arrow-up",
  "arrow-down",
  "x-box",
  "check-box",
  "cloud",
]);

const createShapeSchema = z.object({
  type: z.enum(["geo", "text", "note"]),
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),
  h: z.number().optional(),
  text: z.string().optional(),
  geo: geoTypeSchema.optional(),
  color: colorSchema,
});

const updateShapeSchema = z.object({
  id: z.string().describe("Existing shape id from canvas snapshot"),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  text: z.string().optional(),
  color: colorSchema,
});

/** Client-executed canvas tools (no server execute). */
export const canvasClientTools = {
  create_shapes: tool({
    description:
      "Create geo, text, or note shapes on the current tldraw page. Prefer this for drawing boards, cards, and labels.",
    inputSchema: z.object({
      shapes: z.array(createShapeSchema).min(1).max(40),
    }),
  }),
  update_shapes: tool({
    description: "Move, resize, recolor, or retitle existing shapes by id.",
    inputSchema: z.object({
      shapes: z.array(updateShapeSchema).min(1).max(40),
    }),
  }),
  delete_shapes: tool({
    description: "Delete shapes by id from the current page.",
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).max(80),
    }),
  }),
  clear_page: tool({
    description: "Delete every shape on the current page. Use only when asked.",
    inputSchema: z.object({
      confirm: z.literal(true),
    }),
  }),
};

export type CanvasClientTools = typeof canvasClientTools;
export type CreateShapeInput = z.infer<typeof createShapeSchema>;
export type UpdateShapeInput = z.infer<typeof updateShapeSchema>;
