"use client";

import { createContext, useContext } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export const CanvasApiContext = createContext<ExcalidrawImperativeAPI | null>(
  null,
);

export function useCanvasApi() {
  return useContext(CanvasApiContext);
}
