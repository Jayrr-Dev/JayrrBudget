/**
 * Canvas palette (open-color based, same family Excalidraw ships).
 *
 * Strong names ("blue") are for strokes, arrows, and text accents.
 * "-light" names are pastel fills for boxes and bars.
 * "-tint" names are near-white fills for lanes, sections, and frames.
 */
export const CANVAS_PALETTE = {
  // strokes / text
  black: "#1e1e1e",
  white: "#ffffff",
  grey: "#868e96",
  "dark-grey": "#495057",
  red: "#e03131",
  orange: "#e8590c",
  yellow: "#f08c00",
  green: "#2f9e44",
  teal: "#0c8599",
  blue: "#1971c2",
  violet: "#6741d9",
  pink: "#c2255c",
  brown: "#846358",

  // pastel fills
  "grey-light": "#dee2e6",
  "red-light": "#ffc9c9",
  "orange-light": "#ffd8a8",
  "yellow-light": "#ffec99",
  "green-light": "#b2f2bb",
  "teal-light": "#96f2d7",
  "blue-light": "#a5d8ff",
  "violet-light": "#d0bfff",
  "pink-light": "#fcc2d7",
  "brown-light": "#e8d9d0",

  // near-white tints for lanes / sections
  "grey-tint": "#f8f9fa",
  "red-tint": "#fff5f5",
  "orange-tint": "#fff4e6",
  "yellow-tint": "#fff9db",
  "green-tint": "#ebfbee",
  "teal-tint": "#e6fcf5",
  "blue-tint": "#e7f5ff",
  "violet-tint": "#f3f0ff",
  "pink-tint": "#fff0f6",
} as const;

export type CanvasColorName = keyof typeof CANVAS_PALETTE;

export const canvasColorNames = Object.keys(CANVAS_PALETTE) as CanvasColorName[];

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Resolve a palette name, raw hex, or "transparent" to a color string.
 * Unknown values fall back so a bad model guess never breaks the draw.
 */
export function resolveCanvasColor(
  color: string | undefined,
  fallback: string,
): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (trimmed === "transparent") return "transparent";
  if (HEX_PATTERN.test(trimmed)) return trimmed;
  const named = CANVAS_PALETTE[trimmed as CanvasColorName];
  return named ?? fallback;
}
