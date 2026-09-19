"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ComponentProps } from "react";

export type JevDrawProps = ComponentProps<typeof Excalidraw>;

export function JevDraw(props: JevDrawProps) {
  return <Excalidraw {...props} />;
}
