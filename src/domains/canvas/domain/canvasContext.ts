import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

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

function elementText(element: {
  type: string;
  text?: string;
}): string | undefined {
  if (element.type !== "text") return undefined;
  const text = element.text?.trim();
  return text || undefined;
}

/** Compact board snapshot for the model. Caps element count. */
export function getCanvasSnapshot(
  api: ExcalidrawImperativeAPI,
  limit = 80,
) {
  const elements = api.getSceneElements();
  return {
    pageId: "canvas",
    pageName: "Board",
    shapeCount: elements.length,
    shapes: elements.slice(0, limit).map((element) => ({
      id: element.id,
      type: element.type,
      x: Math.round(element.x),
      y: Math.round(element.y),
      rotation: element.angle,
      text: elementText(element),
      w: Math.round(element.width),
      h: Math.round(element.height),
      geo: element.type,
      color: element.strokeColor,
    })),
  };
}

export type CanvasSnapshot = ReturnType<typeof getCanvasSnapshot>;
