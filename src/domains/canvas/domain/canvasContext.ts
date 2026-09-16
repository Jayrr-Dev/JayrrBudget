import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const DEFAULT_SNAPSHOT_LIMIT = 120;

export type CanvasShapeSnapshot = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  stroke?: string;
  fill?: string;
  from?: string;
  to?: string;
  frameId?: string;
  name?: string;
};

/**
 * Compact board snapshot for the model.
 * Bound label text is folded into its container; arrows expose from/to ids.
 */
export function getCanvasSnapshot(
  api: ExcalidrawImperativeAPI,
  limit = DEFAULT_SNAPSHOT_LIMIT,
) {
  const elements = api.getSceneElements();
  const labelByContainer = new Map<string, string>();
  for (const element of elements) {
    if (element.type === "text" && element.containerId) {
      labelByContainer.set(element.containerId, element.originalText || element.text);
    }
  }

  const visible = elements.filter(
    (element) => !(element.type === "text" && element.containerId),
  );

  const shapes: CanvasShapeSnapshot[] = visible.slice(0, limit).map((element) => {
    const shape: CanvasShapeSnapshot = {
      id: element.id,
      type: element.type,
      x: Math.round(element.x),
      y: Math.round(element.y),
      w: Math.round(element.width),
      h: Math.round(element.height),
    };
    const text =
      element.type === "text"
        ? element.originalText || element.text
        : labelByContainer.get(element.id);
    if (text?.trim()) shape.text = text.trim();
    if (element.strokeColor !== "#1e1e1e") shape.stroke = element.strokeColor;
    if (element.backgroundColor !== "transparent") {
      shape.fill = element.backgroundColor;
    }
    if (element.type === "arrow") {
      if (element.startBinding) shape.from = element.startBinding.elementId;
      if (element.endBinding) shape.to = element.endBinding.elementId;
    }
    if (element.type === "frame") shape.name = element.name ?? undefined;
    if (element.frameId) shape.frameId = element.frameId;
    return shape;
  });

  return {
    pageId: "canvas",
    pageName: "Board",
    shapeCount: visible.length,
    shapes,
  };
}

export type CanvasSnapshot = ReturnType<typeof getCanvasSnapshot>;
