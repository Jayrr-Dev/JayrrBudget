"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ComponentProps } from "react";

export type JayrrDrawProps = ComponentProps<typeof Excalidraw>;

export function JayrrDraw(props: JayrrDrawProps) {
  return <Excalidraw {...props} />;
}
