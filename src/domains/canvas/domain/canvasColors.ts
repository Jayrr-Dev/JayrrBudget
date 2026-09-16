export const canvasColorNames = [
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
] as const;

export type CanvasColorName = (typeof canvasColorNames)[number];

const COLOR_HEX: Record<CanvasColorName, string> = {
  black: "#1e1e1e",
  grey: "#868e96",
  "light-violet": "#e599f7",
  violet: "#9c36b5",
  blue: "#1971c2",
  "light-blue": "#74c0fc",
  yellow: "#f08c00",
  orange: "#e8590c",
  green: "#2f9e44",
  "light-green": "#8ce99a",
  "light-red": "#ffa8a8",
  red: "#e03131",
  white: "#ffffff",
};

export function canvasColorToHex(color: CanvasColorName | undefined, fallback: string) {
  if (!color) return fallback;
  return COLOR_HEX[color];
}
