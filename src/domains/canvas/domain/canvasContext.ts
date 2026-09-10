import type { Editor, TLShape } from "tldraw";

export type CanvasShapeSnapshot = {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  text?: string;
  w?: number;
  h?: number;
  geo?: string;
  color?: string;
};

function richTextToPlain(richText: unknown): string | undefined {
  if (!richText || typeof richText !== "object") return undefined;
  const chunks: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") chunks.push(record.text);
    if (Array.isArray(record.content)) {
      for (const child of record.content) walk(child);
    }
  };

  walk(richText);
  const text = chunks.join("").trim();
  return text || undefined;
}

function shapeSnapshot(shape: TLShape): CanvasShapeSnapshot {
  const props = shape.props as Record<string, unknown>;
  const text =
    typeof props.text === "string"
      ? props.text
      : richTextToPlain(props.richText);

  return {
    id: shape.id,
    type: shape.type,
    x: Math.round(shape.x),
    y: Math.round(shape.y),
    rotation: shape.rotation,
    text,
    w: typeof props.w === "number" ? props.w : undefined,
    h: typeof props.h === "number" ? props.h : undefined,
    geo: typeof props.geo === "string" ? props.geo : undefined,
    color: typeof props.color === "string" ? props.color : undefined,
  };
}

/** Compact page snapshot for the model. Caps shape count. */
export function getCanvasSnapshot(editor: Editor, limit = 80) {
  const shapes = editor.getCurrentPageShapes().slice(0, limit).map(shapeSnapshot);
  const page = editor.getCurrentPage();
  return {
    pageId: page.id,
    pageName: page.name,
    shapeCount: editor.getCurrentPageShapes().length,
    shapes,
  };
}

export type CanvasSnapshot = ReturnType<typeof getCanvasSnapshot>;
