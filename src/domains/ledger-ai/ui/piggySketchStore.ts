"use client";

import { useSyncExternalStore } from "react";
import type { ShowSketchInput } from "@/domains/ledger-ai/domain/sketchBoard";

export type PiggySketchState = {
  open: boolean;
  title: string;
  caption?: string;
  commands: ShowSketchInput["commands"];
};

const EMPTY: PiggySketchState = {
  open: false,
  title: "",
  commands: [],
};

let snapshot: PiggySketchState = EMPTY;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function showPiggySketch(input: ShowSketchInput) {
  snapshot = {
    open: true,
    title: input.title,
    caption: input.caption,
    commands: input.commands,
  };
  notify();
}

export function closePiggySketch() {
  snapshot = { ...snapshot, open: false };
  notify();
}

export function usePiggySketch() {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => snapshot,
    () => EMPTY,
  );
}
