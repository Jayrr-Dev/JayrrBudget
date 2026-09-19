import { resolveCanvasColor } from "@/domains/canvas/domain/canvasColors";
import {
  buildCanvasSkeleton,
  type CanvasSkeletonArgs,
} from "@/domains/canvas/domain/canvasSkeletons";
import type {
  CanvasArrowInput,
  CanvasContainerInput,
  CanvasFontName,
  CanvasFrameInput,
  CanvasLineInput,
  CanvasNoteInput,
  CanvasTextInput,
  CreateElementInput,
  UpdateElementInput,
} from "@/domains/canvas/domain/canvasTools";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
  type Arrowhead,
  type ExcalidrawElement,
  type ExcalidrawElementSkeleton,
  type ExcalidrawImperativeAPI,
  type ExcalidrawTextElement,
  type FontFamilyValues,
} from "jev-draw";

const DEFAULT_STROKE = "#1e1e1e";
const DEFAULT_TEXT = "#1e1e1e";
const NOTE_FILL = "#ffec99";
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_FRAME_PADDING = 24;
const ARROW_GAP = 4;
const LINE_HEIGHT = 1.25;
const CHAR_WIDTH_RATIO = 1.2;

const FONT_FAMILY: Record<CanvasFontName, FontFamilyValues> = {
  hand: 5, // Excalifont
  clean: 6, // Nunito
  heading: 7, // Lilita One
  code: 8, // Comic Shanns
};

/** CSS family names Excalidraw registers for the fonts Piggy can pick. */
const FONT_CSS_FAMILY: Record<CanvasFontName, string> = {
  hand: "Excalifont",
  clean: "Nunito",
  heading: '"Lilita One"',
  code: '"Comic Shanns"',
};

/**
 * Excalidraw measures labels with canvas `measureText` and downloads fonts
 * lazily, so measuring before a font has arrived uses a fallback face: the
 * stored width/wrapping is wrong and the rendered text gets clipped until the
 * user edits it. Wait for every Piggy font before touching the scene.
 */
export async function ensureCanvasFontsLoaded(sampleText = "") {
  if (typeof document === "undefined" || !document.fonts) return;
  const text = sampleText || "Jev";
  await Promise.all(
    Object.values(FONT_CSS_FAMILY).map((family) =>
      document.fonts
        .load(`${DEFAULT_FONT_SIZE}px ${family}`, text)
        .catch(() => undefined),
    ),
  );
}

/** Collect every string the model wants drawn so font subsets cover it. */
function collectSceneText(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectSceneText(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        key === "text" ||
        key === "label" ||
        key === "name" ||
        key === "title"
      ) {
        collectSceneText(item, out);
      } else if (typeof item === "object") {
        collectSceneText(item, out);
      }
    }
  }
  return out;
}

type Box = { x: number; y: number; w: number; h: number };

type Skeleton = ExcalidrawElementSkeleton;

/** Fields shared by every element type, safe to patch via newElementWith. */
type Writable<T> = { -readonly [P in keyof T]: T[P] };
type ElementPatch = Partial<
  Writable<
    Pick<
      ExcalidrawElement,
      | "x"
      | "y"
      | "width"
      | "height"
      | "strokeColor"
      | "backgroundColor"
      | "fillStyle"
      | "strokeWidth"
      | "strokeStyle"
      | "roughness"
      | "opacity"
      | "boundElements"
      | "frameId"
    >
  >
>;

type PendingBinding = {
  arrowId: string;
  side: "start" | "end";
  targetId: string;
};

/**
 * ref -> element id, remembered for the whole chat. A ref is used as the id
 * when it is free; when the model reuses a ref the alias points at the newest
 * element so later arrows, frames, updates, and deletes hit the right shape.
 */
export type CanvasRefAliases = Map<string, string>;

export function createCanvasRefAliases(): CanvasRefAliases {
  return new Map();
}

function newShapeId() {
  return crypto.randomUUID();
}

function liveElement(
  byId: ReadonlyMap<string, ExcalidrawElement>,
  id: string | undefined,
) {
  if (!id) return undefined;
  const element = byId.get(id);
  return element && !element.isDeleted ? element : undefined;
}

/** Turn a ref or id from the model into a live element id. */
function resolveAlias(
  aliases: CanvasRefAliases,
  byId: ReadonlyMap<string, ExcalidrawElement>,
  refOrId: string,
) {
  const aliased = aliases.get(refOrId);
  return aliased && liveElement(byId, aliased) ? aliased : refOrId;
}

function fontFamily(font: CanvasFontName | undefined) {
  return font ? FONT_FAMILY[font] : FONT_FAMILY.hand;
}

function arrowhead(
  value: CanvasArrowInput["endArrowhead"],
  fallback: Arrowhead | null,
): Arrowhead | null {
  if (value === undefined) return fallback;
  return value === "none" ? null : value;
}

function estimateTextBox(input: CanvasTextInput): Box {
  const fontSize = input.fontSize ?? DEFAULT_FONT_SIZE;
  const lines = input.text.split("\n");
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return {
    x: input.x,
    y: input.y,
    w: longest * fontSize * CHAR_WIDTH_RATIO,
    h: lines.length * fontSize * LINE_HEIGHT,
  };
}

function elementBox(element: ExcalidrawElement): Box {
  return { x: element.x, y: element.y, w: element.width, h: element.height };
}

/** Scene-space bounds; linear elements can have points left/above their origin. */
function sceneBounds(element: ExcalidrawElement): Box {
  if (element.type !== "arrow" && element.type !== "line") {
    return elementBox(element);
  }
  const xs = element.points.map((p) => p[0]);
  const ys = element.points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: element.x + minX,
    y: element.y + minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

/**
 * Excalidraw frames do not follow their children. After children move or
 * grow, widen any frame that would otherwise clip them. Frames only grow.
 */
function growFramesAround(
  nextById: Map<string, ExcalidrawElement>,
  changedIds: Iterable<string>,
) {
  const frameIds = new Set<string>();
  for (const id of changedIds) {
    const frameId = nextById.get(id)?.frameId;
    if (frameId) frameIds.add(frameId);
  }
  for (const frameId of frameIds) {
    const frame = nextById.get(frameId);
    if (!frame || frame.type !== "frame" || frame.isDeleted) continue;
    let minX = frame.x;
    let minY = frame.y;
    let maxX = frame.x + frame.width;
    let maxY = frame.y + frame.height;
    for (const element of nextById.values()) {
      if (element.isDeleted || element.frameId !== frameId) continue;
      const box = sceneBounds(element);
      minX = Math.min(minX, box.x - DEFAULT_FRAME_PADDING);
      minY = Math.min(minY, box.y - DEFAULT_FRAME_PADDING);
      maxX = Math.max(maxX, box.x + box.w + DEFAULT_FRAME_PADDING);
      maxY = Math.max(maxY, box.y + box.h + DEFAULT_FRAME_PADDING);
    }
    nextById.set(
      frameId,
      newElementWith(frame, {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      }),
    );
  }
}

function inferRoute(arrow: {
  points: readonly unknown[];
  roundness: ExcalidrawElement["roundness"];
}) {
  if (arrow.points.length === 2) return "straight" as const;
  return arrow.roundness ? ("curved" as const) : ("elbow" as const);
}

/**
 * Arrows keep their old geometry when a bound shape is resized through
 * updateScene, so a grown box leaves the arrow off-centre. Re-route arrows
 * whose ends are bound to changed shapes, and re-seat their labels.
 */
function rerouteBoundArrows(
  nextById: Map<string, ExcalidrawElement>,
  changedIds: ReadonlySet<string>,
) {
  for (const element of [...nextById.values()]) {
    if (element.type !== "arrow" || element.isDeleted) continue;
    if (!("elbowed" in element)) continue;
    const fromId = element.startBinding?.elementId;
    const toId = element.endBinding?.elementId;
    if (!fromId || !toId) continue;
    if (!changedIds.has(fromId) && !changedIds.has(toId)) continue;
    const from = liveElement(nextById, fromId);
    const to = liveElement(nextById, toId);
    if (!from || !to) continue;

    const routed = routeArrow(
      elementBox(from),
      elementBox(to),
      inferRoute(element),
    );
    const xs = routed.points.map((p) => p[0]);
    const ys = routed.points.map((p) => p[1]);
    const nextArrow = newElementWith(element, {
      x: routed.x,
      y: routed.y,
      points: routed.points as unknown as typeof element.points,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    });
    nextById.set(element.id, nextArrow);

    const label = [...nextById.values()].find(
      (candidate) =>
        candidate.type === "text" &&
        candidate.containerId === element.id &&
        !candidate.isDeleted,
    );
    if (label?.type !== "text") continue;
    const fitted = fitBoundLabel(
      nextArrow,
      elementBox(nextArrow),
      label.originalText || label.text,
      {
        fontSize: label.fontSize,
        fontFamily: label.fontFamily,
        textAlign: label.textAlign,
        verticalAlign: label.verticalAlign,
        strokeColor: label.strokeColor,
      },
    );
    if (!fitted) continue;
    nextById.set(
      label.id,
      newElementWith(label, {
        x: fitted.label.x,
        y: fitted.label.y,
        width: fitted.label.width,
        height: fitted.label.height,
      }),
    );
  }
}

/**
 * Measure a standalone text element with Excalidraw's own font metrics, the
 * same path `convertToExcalidrawElements` takes on creation.
 */
function measureStandaloneText(
  existing: ExcalidrawTextElement,
  text: string,
  fontSize: number,
) {
  const [measured] = convertToExcalidrawElements([
    {
      type: "text",
      x: existing.x,
      y: existing.y,
      text,
      fontSize,
      fontFamily: existing.fontFamily,
      textAlign: existing.textAlign,
    },
  ]);
  return measured?.type === "text" ? measured : undefined;
}

type BoundLabelStyle = Pick<
  ExcalidrawTextElement,
  "fontSize" | "fontFamily" | "textAlign" | "verticalAlign" | "strokeColor"
>;

/**
 * Run a shape plus its label through Excalidraw's converter so the label is
 * measured, wrapped, and placed exactly as on creation. The returned shape may
 * be taller/wider than `geometry` when the text does not fit.
 */
function fitBoundLabel(
  container: ExcalidrawElement,
  geometry: Box,
  text: string,
  style: BoundLabelStyle,
) {
  const base = {
    id: container.id,
    x: geometry.x,
    y: geometry.y,
    width: geometry.w,
    height: geometry.h,
    roundness: container.roundness,
    label: { text, ...style },
  };
  let skeleton: Skeleton;
  if (container.type === "arrow") {
    skeleton = {
      ...base,
      type: "arrow",
      points: container.points.map((p) => [p[0], p[1]] as [number, number]),
    };
  } else if (
    container.type === "rectangle" ||
    container.type === "ellipse" ||
    container.type === "diamond"
  ) {
    skeleton = { ...base, type: container.type };
  } else {
    return undefined;
  }

  const converted = convertToExcalidrawElements([skeleton], {
    regenerateIds: false,
  });
  const shape = converted.find((element) => element.id === container.id);
  const label = converted.find((element) => element.type === "text");
  if (!shape || label?.type !== "text") return undefined;
  return { shape, label };
}

function center(box: Box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/**
 * Pick the facing edge midpoints of two boxes so arrows leave/enter on the
 * side nearest to the other shape, then build the local point path.
 */
function routeArrow(
  from: Box,
  to: Box,
  route: CanvasArrowInput["route"],
): { x: number; y: number; points: [number, number][] } {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  const start = horizontal
    ? { x: dx >= 0 ? from.x + from.w + ARROW_GAP : from.x - ARROW_GAP, y: a.y }
    : { x: a.x, y: dy >= 0 ? from.y + from.h + ARROW_GAP : from.y - ARROW_GAP };
  const end = horizontal
    ? { x: dx >= 0 ? to.x - ARROW_GAP : to.x + to.w + ARROW_GAP, y: b.y }
    : { x: b.x, y: dy >= 0 ? to.y - ARROW_GAP : to.y + to.h + ARROW_GAP };

  const ex = end.x - start.x;
  const ey = end.y - start.y;

  if (route === "straight") {
    return {
      x: start.x,
      y: start.y,
      points: [
        [0, 0],
        [ex, ey],
      ],
    };
  }
  if (route === "curved") {
    const mid: [number, number] = horizontal
      ? [ex / 2, ey / 2 - Math.sign(ey || 1) * Math.min(40, Math.abs(ex) / 4)]
      : [ex / 2 + Math.sign(ex || 1) * Math.min(40, Math.abs(ey) / 4), ey / 2];
    return { x: start.x, y: start.y, points: [[0, 0], mid, [ex, ey]] };
  }

  // elbow (default)
  if (Math.abs(horizontal ? ey : ex) < 1) {
    return {
      x: start.x,
      y: start.y,
      points: [
        [0, 0],
        [ex, ey],
      ],
    };
  }
  const points: [number, number][] = horizontal
    ? [
        [0, 0],
        [ex / 2, 0],
        [ex / 2, ey],
        [ex, ey],
      ]
    : [
        [0, 0],
        [0, ey / 2],
        [ex, ey / 2],
        [ex, ey],
      ];
  return { x: start.x, y: start.y, points };
}

function baseStyle(input: {
  stroke?: string;
  fill?: string;
  fillStyle?: "solid" | "hachure" | "cross-hatch" | "zigzag";
  strokeWidth?: 1 | 2 | 4;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: 0 | 1 | 2;
  opacity?: number;
}) {
  return {
    strokeColor: resolveCanvasColor(input.stroke, DEFAULT_STROKE),
    backgroundColor: resolveCanvasColor(input.fill, "transparent"),
    fillStyle: input.fillStyle ?? "solid",
    strokeWidth: input.strokeWidth ?? 2,
    strokeStyle: input.strokeStyle ?? "solid",
    roughness: input.roughness ?? 1,
    opacity: input.opacity ?? 100,
  };
}

function containerRoundness(
  type: CanvasContainerInput["type"],
  rounded: boolean | undefined,
) {
  if (rounded === false || type === "ellipse") return null;
  return type === "rectangle" ? { type: 3 as const } : { type: 2 as const };
}

class CreateBatch {
  private readonly refToId = new Map<string, string>();
  private readonly groupIds = new Map<string, string>();
  private readonly boxes = new Map<string, Box>();
  private readonly batchIds = new Set<string>();
  /** Every id already in the scene, deleted ones included (ids must stay unique). */
  private readonly takenIds: Set<string>;
  private readonly existing: Map<string, ExcalidrawElement>;
  private readonly aliases: CanvasRefAliases;

  readonly skeletons: Skeleton[] = [];
  readonly createdIds: string[] = [];
  readonly warnings: string[] = [];
  /** Existing elements to patch after conversion (bindings, frames). */
  readonly existingPatches = new Map<string, ElementPatch>();
  /** Arrow ends that target pre-existing elements; bound after conversion. */
  readonly pendingBindings: PendingBinding[] = [];

  constructor(
    existing: readonly ExcalidrawElement[],
    aliases: CanvasRefAliases,
  ) {
    this.takenIds = new Set(existing.map((e) => e.id));
    this.existing = new Map(
      existing.filter((e) => !e.isDeleted).map((e) => [e.id, e]),
    );
    this.aliases = aliases;
  }

  /** Use the ref as the id when nothing on the board has it yet. */
  private pickId(ref: string | undefined) {
    if (ref && !this.takenIds.has(ref) && !this.batchIds.has(ref)) return ref;
    return newShapeId();
  }

  /** First pass: assign ids so arrows/frames can reference later items. */
  assignIds(inputs: CreateElementInput[]) {
    return inputs.map((input) => {
      const duplicate = input.ref ? this.refToId.has(input.ref) : false;
      const id = this.pickId(duplicate ? undefined : input.ref);
      this.batchIds.add(id);
      if (input.ref) {
        if (duplicate) {
          this.warnings.push(
            `Duplicate ref "${input.ref}"; later one ignored.`,
          );
        } else {
          this.refToId.set(input.ref, id);
        }
      }
      return { id, input };
    });
  }

  /** Make this call's refs resolvable by later calls in the same chat. */
  commitAliases() {
    for (const [ref, id] of this.refToId) this.aliases.set(ref, id);
  }

  resolveId(refOrId: string): string | undefined {
    if (this.refToId.has(refOrId)) return this.refToId.get(refOrId);
    const aliased = this.aliases.get(refOrId);
    if (aliased && this.existing.has(aliased)) return aliased;
    if (this.batchIds.has(refOrId) || this.existing.has(refOrId))
      return refOrId;
    return undefined;
  }

  boxFor(id: string): Box | undefined {
    return this.boxes.get(id) ?? this.existingBox(id);
  }

  private existingBox(id: string) {
    const element = this.existing.get(id);
    return element ? elementBox(element) : undefined;
  }

  isExisting(id: string) {
    return this.existing.has(id) && !this.batchIds.has(id);
  }

  groupIdsFor(group: string | undefined) {
    if (!group) return undefined;
    let id = this.groupIds.get(group);
    if (!id) {
      id = newShapeId();
      this.groupIds.set(group, id);
    }
    return [id];
  }

  push(id: string, skeleton: Skeleton, box?: Box) {
    this.skeletons.push(skeleton);
    this.createdIds.push(id);
    if (box) this.boxes.set(id, box);
  }

  addExistingPatch(id: string, patch: ElementPatch) {
    const prev = this.existingPatches.get(id) ?? {};
    this.existingPatches.set(id, { ...prev, ...patch });
  }

  existingElement(id: string) {
    return this.existing.get(id);
  }
}

function buildContainer(
  batch: CreateBatch,
  id: string,
  input: CanvasContainerInput,
) {
  const box: Box = { x: input.x, y: input.y, w: input.w, h: input.h };
  batch.push(
    id,
    {
      id,
      type: input.type,
      x: input.x,
      y: input.y,
      width: input.w,
      height: input.h,
      roundness: containerRoundness(input.type, input.rounded),
      groupIds: batch.groupIdsFor(input.group),
      ...baseStyle(input),
      label: input.text
        ? {
            text: input.text,
            fontSize: input.fontSize ?? DEFAULT_FONT_SIZE,
            fontFamily: fontFamily(input.font),
            textAlign: input.textAlign ?? "left",
            verticalAlign: input.verticalAlign ?? "top",
            strokeColor: resolveCanvasColor(input.textColor, DEFAULT_TEXT),
          }
        : undefined,
    },
    box,
  );
}

function buildText(batch: CreateBatch, id: string, input: CanvasTextInput) {
  batch.push(
    id,
    {
      id,
      type: "text",
      x: input.x,
      y: input.y,
      text: input.text,
      fontSize: input.fontSize ?? DEFAULT_FONT_SIZE,
      fontFamily: fontFamily(input.font),
      textAlign: input.textAlign ?? "left",
      strokeColor: resolveCanvasColor(input.color, DEFAULT_TEXT),
      opacity: input.opacity ?? 100,
      groupIds: batch.groupIdsFor(input.group),
    },
    estimateTextBox(input),
  );
}

function buildNote(batch: CreateBatch, id: string, input: CanvasNoteInput) {
  const w = input.w ?? 200;
  const h = input.h ?? 120;
  batch.push(
    id,
    {
      id,
      type: "rectangle",
      x: input.x,
      y: input.y,
      width: w,
      height: h,
      roundness: { type: 3 },
      strokeColor: DEFAULT_STROKE,
      backgroundColor: resolveCanvasColor(input.fill, NOTE_FILL),
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 1,
      groupIds: batch.groupIdsFor(input.group),
      label: {
        text: input.text,
        fontSize: input.fontSize ?? 18,
        fontFamily: FONT_FAMILY.hand,
        textAlign: "left",
        verticalAlign: "top",
        strokeColor: DEFAULT_TEXT,
      },
    },
    { x: input.x, y: input.y, w, h },
  );
}

function buildLine(batch: CreateBatch, id: string, input: CanvasLineInput) {
  const xs = input.points.map((p) => p[0]);
  const ys = input.points.map((p) => p[1]);
  const style = baseStyle(input);
  batch.push(
    id,
    {
      id,
      type: "line",
      x: input.x,
      y: input.y,
      points: input.points,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
      strokeStyle: style.strokeStyle,
      roughness: style.roughness,
      opacity: style.opacity,
      roundness: null,
      groupIds: batch.groupIdsFor(input.group),
    },
    {
      x: input.x + Math.min(...xs),
      y: input.y + Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
  );
}

function buildArrow(batch: CreateBatch, id: string, input: CanvasArrowInput) {
  const style = baseStyle(input);
  const fromId = input.from ? batch.resolveId(input.from) : undefined;
  const toId = input.to ? batch.resolveId(input.to) : undefined;

  if (input.from && !fromId) {
    batch.warnings.push(`Arrow "from" target "${input.from}" not found.`);
  }
  if (input.to && !toId) {
    batch.warnings.push(`Arrow "to" target "${input.to}" not found.`);
  }

  const fromBox = fromId ? batch.boxFor(fromId) : undefined;
  const toBox = toId ? batch.boxFor(toId) : undefined;

  let x = input.x ?? 0;
  let y = input.y ?? 0;
  let points: [number, number][] = input.points ?? [
    [0, 0],
    [160, 0],
  ];

  if (fromBox && toBox) {
    const routed = routeArrow(fromBox, toBox, input.route ?? "elbow");
    x = routed.x;
    y = routed.y;
    points = routed.points;
  } else if (fromBox || toBox) {
    // Only one end known: fall back to a short arrow leaving/entering that box.
    const box = (fromBox ?? toBox)!;
    const c = center(box);
    if (fromBox) {
      x = box.x + box.w + ARROW_GAP;
      y = c.y;
    } else {
      x = box.x - ARROW_GAP - 120;
      y = c.y;
    }
    points = [
      [0, 0],
      [120, 0],
    ];
  }

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);

  const bindInBatch = (targetId: string | undefined) =>
    targetId && !batch.isExisting(targetId) ? { id: targetId } : undefined;

  const skeleton: Skeleton = {
    id,
    type: "arrow",
    x,
    y,
    points,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    startArrowhead: arrowhead(input.startArrowhead, null),
    endArrowhead: arrowhead(input.endArrowhead, "arrow"),
    roundness: input.route === "curved" ? { type: 2 } : null,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
    groupIds: batch.groupIdsFor(input.group),
    start: bindInBatch(fromId),
    end: bindInBatch(toId),
    label: input.label
      ? {
          text: input.label,
          fontSize: input.labelFontSize ?? 16,
          fontFamily: FONT_FAMILY.hand,
          strokeColor: DEFAULT_TEXT,
        }
      : undefined,
  };

  batch.push(id, skeleton);

  // Bindings to elements already on the board are patched after conversion.
  for (const [side, targetId] of [
    ["start", fromId],
    ["end", toId],
  ] as const) {
    if (!targetId || !batch.isExisting(targetId)) continue;
    const target = batch.existingElement(targetId);
    if (!target) continue;
    batch.addExistingPatch(targetId, {
      boundElements: [
        ...(target.boundElements ?? []),
        { id, type: "arrow" as const },
      ],
    });
    batch.pendingBindings.push({ arrowId: id, side, targetId });
  }
}

function buildFrame(batch: CreateBatch, id: string, input: CanvasFrameInput) {
  const padding = input.padding ?? DEFAULT_FRAME_PADDING;
  const batchChildren: string[] = [];
  const existingChildren: string[] = [];
  const boxes: Box[] = [];

  for (const child of input.children) {
    const childId = batch.resolveId(child);
    if (!childId) {
      batch.warnings.push(`Frame "${input.name}" child "${child}" not found.`);
      continue;
    }
    const box = batch.boxFor(childId);
    if (box) boxes.push(box);
    if (batch.isExisting(childId)) existingChildren.push(childId);
    else batchChildren.push(childId);
  }

  if (boxes.length === 0) {
    batch.warnings.push(`Frame "${input.name}" skipped: no valid children.`);
    return;
  }

  const minX = Math.min(...boxes.map((b) => b.x)) - padding;
  const minY = Math.min(...boxes.map((b) => b.y)) - padding;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + padding;
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + padding;

  batch.push(
    id,
    {
      id,
      type: "frame",
      name: input.name,
      children: batchChildren,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  );

  for (const childId of existingChildren) {
    batch.addExistingPatch(childId, { frameId: id });
  }
}

export function applyCreateShapes(
  api: ExcalidrawImperativeAPI,
  inputs: CreateElementInput[],
  aliases: CanvasRefAliases = createCanvasRefAliases(),
) {
  const existing = api.getSceneElementsIncludingDeleted();
  const batch = new CreateBatch(existing, aliases);

  // Frames must be built last so child boxes exist; arrows after shapes.
  const assigned = batch.assignIds(inputs);
  const order = (type: CreateElementInput["type"]) =>
    type === "frame" ? 2 : type === "arrow" ? 1 : 0;
  assigned.sort((a, b) => order(a.input.type) - order(b.input.type));

  for (const { id, input } of assigned) {
    switch (input.type) {
      case "rectangle":
      case "ellipse":
      case "diamond":
        buildContainer(batch, id, input);
        break;
      case "text":
        buildText(batch, id, input);
        break;
      case "note":
        buildNote(batch, id, input);
        break;
      case "line":
        buildLine(batch, id, input);
        break;
      case "arrow":
        buildArrow(batch, id, input);
        break;
      case "frame":
        buildFrame(batch, id, input);
        break;
    }
  }

  const createdElements = convertToExcalidrawElements(batch.skeletons, {
    regenerateIds: false,
  });

  // Arrows pointing at pre-existing elements: attach bindings manually.
  const createdById = new Map(createdElements.map((e) => [e.id, e]));
  for (const { arrowId, side, targetId } of batch.pendingBindings) {
    const arrow = createdById.get(arrowId);
    if (!arrow || arrow.type !== "arrow") continue;
    const binding = {
      elementId: targetId,
      focus: 0,
      gap: ARROW_GAP,
      fixedPoint: null,
    };
    createdById.set(
      arrowId,
      newElementWith(
        arrow,
        side === "start" ? { startBinding: binding } : { endBinding: binding },
      ),
    );
  }

  const nextExisting = existing.map((element) => {
    const patch = batch.existingPatches.get(element.id);
    return patch ? newElementWith(element, patch) : element;
  });

  api.updateScene({
    elements: [...nextExisting, ...createdById.values()],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  batch.commitAliases();

  return {
    ok: true as const,
    createdIds: batch.createdIds,
    warnings: batch.warnings.length ? batch.warnings : undefined,
  };
}

export function applyUpdateShapes(
  api: ExcalidrawImperativeAPI,
  inputs: UpdateElementInput[],
  aliases: CanvasRefAliases = createCanvasRefAliases(),
) {
  const updated: string[] = [];
  const missing: string[] = [];
  const elements = api.getSceneElementsIncludingDeleted();
  const nextById = new Map(elements.map((element) => [element.id, element]));

  for (const rawInput of inputs) {
    const input = {
      ...rawInput,
      id: resolveAlias(aliases, nextById, rawInput.id),
    };
    const existing = nextById.get(input.id);
    if (!existing || existing.isDeleted) {
      missing.push(rawInput.id);
      continue;
    }

    const patch: ElementPatch = {
      x: input.x ?? existing.x,
      y: input.y ?? existing.y,
      width: input.w ?? existing.width,
      height: input.h ?? existing.height,
      strokeColor: input.stroke
        ? resolveCanvasColor(input.stroke, existing.strokeColor)
        : existing.strokeColor,
      backgroundColor: input.fill
        ? resolveCanvasColor(input.fill, existing.backgroundColor)
        : existing.backgroundColor,
      fillStyle: input.fillStyle ?? existing.fillStyle,
      strokeWidth: input.strokeWidth ?? existing.strokeWidth,
      strokeStyle: input.strokeStyle ?? existing.strokeStyle,
      roughness: input.roughness ?? existing.roughness,
      opacity: input.opacity ?? existing.opacity,
    };

    if (existing.type === "text") {
      const nextText = input.text ?? (existing.originalText || existing.text);
      const fontSize = input.fontSize ?? existing.fontSize;
      const measured = measureStandaloneText(existing, nextText, fontSize);
      nextById.set(
        input.id,
        newElementWith(existing, {
          ...patch,
          width: input.w ?? measured?.width ?? existing.width,
          height: input.h ?? measured?.height ?? existing.height,
          text: measured?.text ?? nextText,
          originalText: nextText,
          fontSize,
        }),
      );
    } else {
      const boundCandidate = [...nextById.values()].find(
        (element) =>
          element.type === "text" &&
          element.containerId === input.id &&
          !element.isDeleted,
      );
      const bound =
        boundCandidate?.type === "text" ? boundCandidate : undefined;
      // Any geometry or text change moves the label, so refit it every time.
      const fitted = bound
        ? fitBoundLabel(
            existing,
            {
              x: patch.x ?? existing.x,
              y: patch.y ?? existing.y,
              w: patch.width ?? existing.width,
              h: patch.height ?? existing.height,
            },
            input.text ?? (bound.originalText || bound.text),
            {
              fontSize: input.fontSize ?? bound.fontSize,
              fontFamily: bound.fontFamily,
              textAlign: bound.textAlign,
              verticalAlign: bound.verticalAlign,
              strokeColor: bound.strokeColor,
            },
          )
        : undefined;

      if (fitted) {
        patch.width = fitted.shape.width;
        patch.height = fitted.shape.height;
      }
      nextById.set(input.id, newElementWith(existing, patch));

      if (bound && fitted) {
        nextById.set(
          bound.id,
          newElementWith(bound, {
            x: fitted.label.x,
            y: fitted.label.y,
            width: fitted.label.width,
            height: fitted.label.height,
            text: fitted.label.text,
            originalText: fitted.label.originalText,
            fontSize: fitted.label.fontSize,
            lineHeight: fitted.label.lineHeight,
          }),
        );
      } else if (bound && (input.text != null || input.fontSize != null)) {
        const nextText = input.text ?? (bound.originalText || bound.text);
        nextById.set(
          bound.id,
          newElementWith(bound, {
            text: nextText,
            originalText: nextText,
            fontSize: input.fontSize ?? bound.fontSize,
          }),
        );
      }
    }

    updated.push(input.id);
  }

  const changed = new Set(updated);
  rerouteBoundArrows(nextById, changed);
  growFramesAround(nextById, changed);

  api.updateScene({
    elements: [...nextById.values()],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return { ok: true as const, updated, missing };
}

export function applyDeleteShapes(
  api: ExcalidrawImperativeAPI,
  ids: string[],
  aliases: CanvasRefAliases = createCanvasRefAliases(),
) {
  const elements = api.getSceneElementsIncludingDeleted();
  const byId = new Map(elements.map((element) => [element.id, element]));
  const idSet = new Set(ids.map((id) => resolveAlias(aliases, byId, id)));
  let deleted = 0;
  const next = elements.map((element) => {
    const doomed =
      idSet.has(element.id) ||
      (element.type === "text" &&
        element.containerId != null &&
        idSet.has(element.containerId));
    if (!doomed || element.isDeleted) return element;
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

type ToolHandler = (
  api: ExcalidrawImperativeAPI,
  input: unknown,
  aliases: CanvasRefAliases,
) => unknown;

const canvasToolHandlers = {
  use_skeleton: (api, input, aliases) => {
    const built = buildCanvasSkeleton(input as CanvasSkeletonArgs);
    return applyCreateShapes(api, built.elements, aliases);
  },
  create_shapes: (api, input, aliases) => {
    const { elements } = input as { elements: CreateElementInput[] };
    return applyCreateShapes(api, elements, aliases);
  },
  update_shapes: (api, input, aliases) => {
    const { elements } = input as { elements: UpdateElementInput[] };
    return applyUpdateShapes(api, elements, aliases);
  },
  delete_shapes: (api, input, aliases) => {
    const { ids } = input as { ids: string[] };
    return applyDeleteShapes(api, ids, aliases);
  },
  clear_page: (api) => applyClearPage(api),
} satisfies Record<string, ToolHandler>;

export type CanvasToolName = keyof typeof canvasToolHandlers;

export function isCanvasToolName(name: string): name is CanvasToolName {
  return name in canvasToolHandlers;
}

/**
 * Run a canvas tool on the board by name. Unknown tools return an error
 * object. Waits for Piggy's fonts first so labels are measured with the real
 * face instead of a fallback (see ensureCanvasFontsLoaded).
 */
export async function applyCanvasTool(
  api: ExcalidrawImperativeAPI,
  toolName: string,
  input: unknown,
  aliases: CanvasRefAliases = createCanvasRefAliases(),
) {
  if (!isCanvasToolName(toolName)) {
    return { ok: false as const, error: `Unknown tool ${toolName}` };
  }
  await ensureCanvasFontsLoaded(collectSceneText(input).join(""));
  return canvasToolHandlers[toolName](api, input, aliases);
}
