"use client";

import type { OcrMode } from "@/domains/statements/domain/ocrMode";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

/** Tesseract unless the Tesseract OCR flag is turned off. */
export function useOcrMode(): OcrMode {
  const { isAuthenticated } = useConvexAuth();
  const row = useQuery(
    api.featureFlags.get,
    isAuthenticated ? { key: "tesseractOcr" } : "skip",
  );
  if (row?.enabled === false) return "server";
  return "local";
}
