import { canvasColorToHex } from "@/domains/canvas/domain/canvasColors";
import type {
  CreateShapeInput,
  UpdateShapeInput,
} from "@/domains/canvas/domain/canvasTools";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

function geoType(
  geo: CreateShapeInput["geo"],
): "rectangle" | "ellipse" | "diamond" {
  if (geo === "ellipse" || geo === "oval") return "ellipse";
  if (geo === "diamond" || geo === "rhombus" || geo === "triangle") {
    return "diamond";
  }
  return "rectangle";
}

function newShapeId() {
  return crypto.randomUUID();
}

export function applyCreateShapes(
  api: ExcalidrawImperativeAPI,
  shapes: CreateShapeInput[],
) {
  const created: string[] = [];
  const skeletons = shapes.map((shape) => {
    const id = newShapeId();
    created.push(id);
    const strokeColor = canvasColorToHex(shape.color, "#1e1e1e");

    if (shape.type === "text") {
      return {
        id,
        type: "text" as const,
        x: shape.x,
        y: shape.y,
        text: shape.text ?? "Text",
        strokeColor,
        fontSize: 20,
      };
    }

    if (shape.type === "note") {
      return {
        id,
        type: "rectangle" as const,
        x: shape.x,
        y: shape.y,
        width: shape.w ?? 180,
        height: shape.h ?? 120,
        backgroundColor: "#fff3bf",
        strokeColor: canvasColorToHex(shape.color, "#f08c00"),
        label: { text: shape.text ?? "Note" },
      };
    }

    const type = geoType(shape.geo);
    return {
      id,
      type,
      x: shape.x,
      y: shape.y,
      width: shape.w ?? 160,
      height: shape.h ?? 100,
      strokeColor,
      label: shape.text ? { text: shape.text } : undefined,
    };
  });

  const createdElements = convertToExcalidrawElements(skeletons, {
    regenerateIds: false,
  });
  const existing = api.getSceneElementsIncludingDeleted();

  api.updateScene({
    elements: [...existing, ...createdElements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return { ok: true as const, createdIds: created };
}

export function applyUpdateShapes(
  api: ExcalidrawImperativeAPI,
  shapes: UpdateShapeInput[],
) {
  const updated: string[] = [];
  const missing: string[] = [];
  const elements = api.getSceneElementsIncludingDeleted();
  const byId = new Map(elements.map((element) => [element.id, element]));
  const nextById = new Map(byId);

  for (const shape of shapes) {
    const existing = nextById.get(shape.id);
    if (!existing || existing.isDeleted) {
      missing.push(shape.id);
      continue;
    }

    const geometry = {
      x: shape.x ?? existing.x,
      y: shape.y ?? existing.y,
      width: shape.w ?? existing.width,
      height: shape.h ?? existing.height,
      strokeColor: shape.color
        ? canvasColorToHex(shape.color, existing.strokeColor)
        : existing.strokeColor,
    };

    if (existing.type === "text") {
      nextById.set(
        shape.id,
        newElementWith(existing, {
          ...geometry,
          ...(shape.text != null
            ? { text: shape.text, originalText: shape.text }
            : {}),
        }),
      );
    } else {
      nextById.set(shape.id, newElementWith(existing, geometry));
      if (shape.text != null) {
        const bound = [...nextById.values()].find(
          (element) =>
            element.type === "text" &&
            element.containerId === shape.id &&
            !element.isDeleted,
        );
        if (bound?.type === "text") {
          nextById.set(
            bound.id,
            newElementWith(bound, {
              text: shape.text,
              originalText: shape.text,
            }),
          );
        }
      }
    }

    updated.push(shape.id);
  }

  api.updateScene({
    elements: [...nextById.values()],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return { ok: true as const, updated, missing };
}

export function applyDeleteShapes(api: ExcalidrawImperativeAPI, ids: string[]) {
  const idSet = new Set(ids);
  const elements = api.getSceneElementsIncludingDeleted();
  let deleted = 0;
  const next = elements.map((element) => {
    if (!idSet.has(element.id) || element.isDeleted) return element;
    deleted += 1;
    return newElementWith(element, { isDeleted: true });
  });

  api.updateScene({
    elements: next,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return { ok: true as const, deleted };
}

export function applyClearPage(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElementsIncludingDeleted();
  const next = elements.map((element) =>
    element.isDeleted ? element : newElementWith(element, { isDeleted: true }),
  );
  const deleted = elements.filter((element) => !element.isDeleted).length;

  api.updateScene({
    elements: next,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return { ok: true as const, deleted };
}

const canvasToolHandlers = {
  create_shapes: (api: ExcalidrawImperativeAPI, input: unknown) => {
    const { shapes } = input as { shapes: CreateShapeInput[] };
    return applyCreateShapes(api, shapes);
  },
  update_shapes: (api: ExcalidrawImperativeAPI, input: unknown) => {
    const { shapes } = input as { shapes: UpdateShapeInput[] };
    return applyUpdateShapes(api, shapes);
  },
  delete_shapes: (api: ExcalidrawImperativeAPI, input: unknown) => {
    const { ids } = input as { ids: string[] };
    return applyDeleteShapes(api, ids);
  },
  clear_page: (api: ExcalidrawImperativeAPI, _input?: unknown) =>
    applyClearPage(api),
} as const;

export type CanvasToolName = keyof typeof canvasToolHandlers;

export function isCanvasToolName(name: string): name is CanvasToolName {
  return name in canvasToolHandlers;
}

/** Run a client canvas tool by name. Unknown tools return an error object. */
export function applyCanvasTool(
  api: ExcalidrawImperativeAPI,
  toolName: string,
  input: unknown,
) {
  if (!isCanvasToolName(toolName)) {
    return { ok: false as const, error: `Unknown tool ${toolName}` };
  }
  return canvasToolHandlers[toolName](api, input);
}
