import type { ExcalidrawElement, ExcalidrawImperativeAPI } from "jev-draw";

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function elementLabel(element: ExcalidrawElement) {
  if (element.type === "text") {
    return (element.originalText || element.text).trim();
  }
  if (element.type === "frame") {
    return (element.name ?? "").trim();
  }
  return "";
}

/** Select and scroll to board text/frames whose label matches. */
export function focusCanvasLabel(
  api: ExcalidrawImperativeAPI,
  label: string,
) {
  const needle = normalizeLabel(label);
  if (!needle) return false;
  const matches = api.getSceneElements().filter((element) => {
    if (element.isDeleted) return false;
    return normalizeLabel(elementLabel(element)) === needle;
  });
  if (matches.length === 0) return false;
  const selectedElementIds = Object.fromEntries(
    matches.map((element) => [element.id, true as const]),
  );
  api.updateScene({ appState: { selectedElementIds } });
  api.scrollToContent(matches, { fitToContent: true, animate: true });
  return true;
}
