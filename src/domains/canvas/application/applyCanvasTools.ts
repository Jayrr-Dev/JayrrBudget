import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShapeId,
} from "tldraw";
import type {
  CreateShapeInput,
  UpdateShapeInput,
} from "@/domains/canvas/domain/canvasTools";

function asShapeId(id: string): TLShapeId {
  return id as TLShapeId;
}

export function applyCreateShapes(editor: Editor, shapes: CreateShapeInput[]) {
  const created: string[] = [];

  editor.createShapes(
    shapes.map((shape) => {
      const id = createShapeId();
      created.push(id);

      if (shape.type === "text") {
        return {
          id,
          type: "text" as const,
          x: shape.x,
          y: shape.y,
          props: {
            richText: toRichText(shape.text ?? "Text"),
            size: "m" as const,
            color: shape.color ?? "black",
            autoSize: true,
            w: shape.w ?? 200,
          },
        };
      }

      if (shape.type === "note") {
        return {
          id,
          type: "note" as const,
          x: shape.x,
          y: shape.y,
          props: {
            richText: toRichText(shape.text ?? "Note"),
            color: shape.color ?? "yellow",
            size: "m" as const,
          },
        };
      }

      return {
        id,
        type: "geo" as const,
        x: shape.x,
        y: shape.y,
        props: {
          geo: shape.geo ?? "rectangle",
          w: shape.w ?? 160,
          h: shape.h ?? 100,
          color: shape.color ?? "black",
          richText: toRichText(shape.text ?? ""),
        },
      };
    }),
  );

  return { ok: true as const, createdIds: created };
}

export function applyUpdateShapes(editor: Editor, shapes: UpdateShapeInput[]) {
  const updated: string[] = [];
  const missing: string[] = [];

  for (const shape of shapes) {
    const id = asShapeId(shape.id);
    const existing = editor.getShape(id);
    if (!existing) {
      missing.push(shape.id);
      continue;
    }

    const props = { ...existing.props } as Record<string, unknown>;
    if (shape.w != null && "w" in props) props.w = shape.w;
    if (shape.h != null && "h" in props) props.h = shape.h;
    if (shape.color != null && "color" in props) props.color = shape.color;
    if (shape.text != null && "richText" in props) {
      props.richText = toRichText(shape.text);
    }

    editor.updateShape({
      id,
      type: existing.type,
      x: shape.x ?? existing.x,
      y: shape.y ?? existing.y,
      props,
    });
    updated.push(shape.id);
  }

  return { ok: true as const, updated, missing };
}

export function applyDeleteShapes(editor: Editor, ids: string[]) {
  const existing = ids
    .map(asShapeId)
    .filter((id) => Boolean(editor.getShape(id)));
  editor.deleteShapes(existing);
  return { ok: true as const, deleted: existing.length };
}

export function applyClearPage(editor: Editor) {
  const ids = editor.getCurrentPageShapes().map((shape) => shape.id);
  editor.deleteShapes(ids);
  return { ok: true as const, deleted: ids.length };
}

const canvasToolHandlers = {
  create_shapes: (editor: Editor, input: unknown) => {
    const { shapes } = input as { shapes: CreateShapeInput[] };
    return applyCreateShapes(editor, shapes);
  },
  update_shapes: (editor: Editor, input: unknown) => {
    const { shapes } = input as { shapes: UpdateShapeInput[] };
    return applyUpdateShapes(editor, shapes);
  },
  delete_shapes: (editor: Editor, input: unknown) => {
    const { ids } = input as { ids: string[] };
    return applyDeleteShapes(editor, ids);
  },
  clear_page: (editor: Editor, _input?: unknown) => applyClearPage(editor),
} as const;

export type CanvasToolName = keyof typeof canvasToolHandlers;

export function isCanvasToolName(name: string): name is CanvasToolName {
  return name in canvasToolHandlers;
}

/** Run a client canvas tool by name. Unknown tools return an error object. */
export function applyCanvasTool(
  editor: Editor,
  toolName: string,
  input: unknown,
) {
  if (!isCanvasToolName(toolName)) {
    return { ok: false as const, error: `Unknown tool ${toolName}` };
  }
  return canvasToolHandlers[toolName](editor, input);
}
