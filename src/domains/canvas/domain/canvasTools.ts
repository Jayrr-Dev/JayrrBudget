import { tool } from "ai";
import { z } from "zod";
import { canvasColorNames } from "@/domains/canvas/domain/canvasColors";

const colorSchema = z.enum(canvasColorNames).optional();

const geoTypeSchema = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "oval",
  "rhombus",
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
  id: z.string().describe("Existing element id from canvas snapshot"),
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
      "Create rectangle, ellipse, diamond, text, or note elements on the Excalidraw board. Prefer this for drawing boards, cards, and labels.",
    inputSchema: z.object({
      shapes: z.array(createShapeSchema).min(1).max(40),
    }),
  }),
  update_shapes: tool({
    description: "Move, resize, recolor, or retitle existing elements by id.",
    inputSchema: z.object({
      shapes: z.array(updateShapeSchema).min(1).max(40),
    }),
  }),
  delete_shapes: tool({
    description: "Delete elements by id from the board.",
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).max(80),
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
export type CreateShapeInput = z.infer<typeof createShapeSchema>;
export type UpdateShapeInput = z.infer<typeof updateShapeSchema>;
