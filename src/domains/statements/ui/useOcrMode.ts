"use client";

import {
  DEFAULT_OCR_MODE,
  resolveOcrMode,
  type OcrMode,
} from "@/domains/statements/domain/ocrMode";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";

export function useOcrMode(): OcrMode {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (me === undefined || me === null) return DEFAULT_OCR_MODE;
  return resolveOcrMode(me.ocrMode);
}
